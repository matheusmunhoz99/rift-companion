import { SaxesParser, type SaxesTagNS } from 'saxes';
import { TextDecoder } from 'node:util';
import { BUDDY_ID, type ChatStatus } from './buddy';
import { XmppFramer } from './xmpp';

interface ElementSpan {
  tag: SaxesTagNS;
  start: number;
  /** Fim da tag de abertura (igual a `end` quando auto-fechada). */
  openEnd: number;
  end: number;
  children: ElementSpan[];
}

interface ParsedPresence {
  root: SaxesTagNS;
  children: ElementSpan[];
  openingEnd: number;
  closingStart: number;
}

type Namespaces = Record<string, string>;
const STREAM_NAMESPACE = 'http://etherx.jabber.org/streams';
const CLIENT_NAMESPACE = 'jabber:client';
/** Detalhes do LoL que revelam atividade (fila, partida, grupo); o modo celular os remove. */
const MOBILE_HIDDEN = ['p', 'm', 'st', 'pd'];
const EMPTY = Buffer.alloc(0);

function parsePresence(stanza: string, namespaces: Namespaces): ParsedPresence {
  const parser = new SaxesParser({ xmlns: true, additionalNamespaces: namespaces });
  const stack: ElementSpan[] = [];
  const children: ElementSpan[] = [];
  let root: SaxesTagNS | undefined;
  let openingEnd = 0;
  let closingStart = 0;
  parser.on('doctype', () => { throw new Error('DOCTYPE não permitido no chat.'); });
  parser.on('opentag', (tag) => {
    const span: ElementSpan = {
      tag, start: stanza.lastIndexOf('<', parser.position - 1), openEnd: parser.position, end: 0, children: [],
    };
    if (!stack.length) {
      root = tag;
      openingEnd = parser.position;
    } else if (stack.length === 1) children.push(span);
    else stack[stack.length - 1].children.push(span);
    stack.push(span);
  });
  parser.on('closetag', () => {
    const span = stack.pop()!;
    span.end = parser.position;
    if (!stack.length) closingStart = stanza.lastIndexOf('</', parser.position - 1);
  });
  // A mensagem não inclui a stanza, que pode conter dados pessoais.
  parser.on('error', () => { throw new Error('Presença XMPP inválida.'); });
  parser.write(stanza).close();
  if (!root) throw new Error('Presença XMPP vazia.');
  return { root, children, openingEnd, closingStart };
}

/** Texto do `<body>` de uma mensagem, sem decodificar o restante. */
function messageBody(stanza: string, namespaces: Namespaces): string {
  const parser = new SaxesParser({ xmlns: true, additionalNamespaces: namespaces });
  let depth = 0;
  let inBody = false;
  let body = '';
  parser.on('opentag', (tag) => {
    depth++;
    if (depth === 2 && tag.local === 'body') inBody = true;
  });
  parser.on('closetag', () => {
    if (depth === 2) inBody = false;
    depth--;
  });
  parser.on('text', (text) => { if (inBody) body += text; });
  parser.on('cdata', (text) => { if (inBody) body += text; });
  parser.on('error', () => { throw new Error('Mensagem XMPP inválida.'); });
  parser.write(stanza).close();
  return body;
}

function isGlobal(parsed: ParsedPresence): boolean {
  const { root } = parsed;
  if (root.local !== 'presence' || (root.uri !== '' && root.uri !== CLIENT_NAMESPACE)) return false;
  if (Object.hasOwn(root.attributes, 'to')) return false;
  const type = root.attributes.type?.value;
  return !type || type === 'available' || type === 'unavailable';
}

/** Mantém só os dados do LoL que não revelam atividade, com `st` de celular. */
function mobileLeague(stanza: string, games: ElementSpan | undefined, uri: string, prefix: string): string {
  const league = games?.children.find(({ tag }) => tag.uri === uri && tag.local === 'league_of_legends');
  if (!league) return '';
  let opening = stanza.slice(league.start, league.openEnd);
  if (league.tag.isSelfClosing) opening = opening.replace(/\s*\/>$/, '>');
  const kept = league.children
    .filter(({ tag }) => !(tag.uri === uri && MOBILE_HIDDEN.includes(tag.local)))
    .map(({ start, end }) => stanza.slice(start, end))
    .join('');
  return `${opening}${kept}<${prefix}st>mobile</${prefix}st></${league.tag.name}>`;
}

function rewrite(stanza: string, parsed: ParsedPresence, status: ChatStatus): string {
  if (status === 'online' || !isGlobal(parsed) || parsed.root.attributes.type?.value === 'unavailable') return stanza;
  const { root } = parsed;
  const prefix = root.prefix ? `${root.prefix}:` : '';
  const games = parsed.children.find(({ tag }) => tag.uri === root.uri && tag.local === 'games');
  // Como no Deceive: offline esvazia os jogos; celular conserva só o LoL sem atividade.
  const league = status === 'mobile' ? mobileLeague(stanza, games, root.uri, prefix) : '';
  const hidden = `<${prefix}games>${league}</${prefix}games><${prefix}show>${status}</${prefix}show>`;
  if (root.isSelfClosing) {
    return stanza.slice(0, parsed.openingEnd - 2) + '>' + hidden + `</${root.name}>`;
  }
  // Spans vêm do parser: não confundem filhos com comentários, CDATA ou atributos.
  const removals = parsed.children.filter(({ tag }) =>
    tag.uri === root.uri && ['games', 'show', 'status'].includes(tag.local),
  );
  let position = 0;
  let result = '';
  for (const span of removals) {
    result += stanza.slice(position, span.start);
    position = span.end;
  }
  return result + stanza.slice(position, parsed.closingStart) + hidden + stanza.slice(parsed.closingStart);
}

/** Encurta o conteúdo base64 de jogos (`<p>`, `<pd>`) para o log ficar legível. */
function preview(stanza: string): string {
  return stanza.replace(/<(pd?)>([^<]{40})[^<]*<\/\1>/g, '<$1>$2…</$1>').slice(0, 3000);
}

/** Usado também ao reapresentar a presença global depois de alternar o modo. */
export function rewritePresence(stanza: string, status: ChatStatus, namespaces: Namespaces = {}): string {
  return rewrite(stanza, parsePresence(stanza, namespaces), status);
}

export interface PresenceFilterHooks {
  /** Desligado (com status oculto), presenças para salas também são retidas. */
  lobbyChat?: () => boolean;
  onPresence?: (original: string) => void;
  /** Texto que o jogador mandou ao contato Rift Companion. */
  onBuddyMessage?: (body: string) => void;
  /** Diagnóstico local: nomes das stanzas e presenças (nunca autenticação ou mensagens). */
  log?: (line: string) => void;
}

/**
 * Guarda somente a presença global da sessão. Presenças de sala e mensagens
 * passam byte a byte intactas. Nunca entrega XML incompleto como alternativa.
 */
export class PresenceStreamFilter {
  private readonly framer = new XmppFramer();
  private namespaces: Namespaces = {};
  private lastGlobal: { stanza: string; parsed: ParsedPresence } | null = null;
  private frames = 0;

  constructor(
    private readonly status: () => ChatStatus,
    private readonly hooks: PresenceFilterHooks = {},
  ) {}

  push(chunk: Buffer): Buffer[] {
    return this.framer.push(chunk).map((frame) => this.process(frame)).filter((frame) => frame.length > 0);
  }

  replay(): Buffer | null {
    if (!this.lastGlobal) return null;
    const { stanza, parsed } = this.lastGlobal;
    return Buffer.from(rewrite(stanza, parsed, this.status()));
  }

  flush(): Buffer[] {
    this.framer.end();
    return [];
  }

  private log(line: string): void {
    this.hooks.log?.(line);
  }

  private process(frame: Buffer): Buffer {
    const name = /^<([^\s/>]+)/.exec(frame.toString('utf8'))?.[1];
    if (!name) {
      if (/^<\/[^>]*stream\s*>$/.test(frame.toString('utf8'))) this.lastGlobal = null;
      return frame;
    }
    const local = name.split(':').pop();
    if (local === 'stream') {
      const header = new TextDecoder('utf-8', { fatal: true }).decode(frame);
      const parser = new SaxesParser({ xmlns: true });
      let namespaces: Namespaces = {};
      parser.on('error', () => { throw new Error('Cabeçalho XMPP inválido.'); });
      parser.on('opentag', (tag) => {
        if (tag.uri !== STREAM_NAMESPACE) throw new Error('Namespace do stream XMPP inválido.');
        namespaces = { ...tag.ns };
      });
      parser.write(header + `</${name}>`).close();
      delete namespaces.xml;
      delete namespaces.xmlns;
      this.namespaces = namespaces;
      this.lastGlobal = null;
      return frame;
    }
    // Mensagens, consultas de histórico e recibos para o contato local não vão à Riot.
    if (frame.includes(BUDDY_ID)) {
      const stanza = new TextDecoder('utf-8', { fatal: true }).decode(frame);
      if (local === 'message') {
        const body = messageBody(stanza, this.namespaces).trim();
        if (body) this.hooks.onBuddyMessage?.(body);
      }
      this.log(`retido: <${name}> para o contato Rift Companion`);
      return EMPTY;
    }
    if (local !== 'presence') {
      if (++this.frames <= 60) this.log(`cliente -> riot: <${name}> (${frame.length} bytes)`);
      return frame;
    }
    const stanza = new TextDecoder('utf-8', { fatal: true }).decode(frame);
    const parsed = parsePresence(stanza, this.namespaces);
    const children = parsed.children.map(({ tag }) => tag.name).join(',');
    const status = this.status();
    if (!isGlobal(parsed)) {
      if (status !== 'online' && this.hooks.lobbyChat?.() === false && Object.hasOwn(parsed.root.attributes, 'to')) {
        this.log('presença de sala retida (chat de sala desligado)');
        return EMPTY;
      }
      this.log(`presença de sala/dirigida passou intacta (filhos: ${children})`);
      return frame;
    }
    if (parsed.root.attributes.type?.value === 'unavailable') {
      this.log('presença global unavailable passou intacta');
      this.lastGlobal = null;
      return frame;
    }
    this.lastGlobal = { stanza, parsed };
    this.hooks.onPresence?.(stanza);
    const output = rewrite(stanza, parsed, status);
    this.log(`presença global status=${status}\n  original: ${preview(stanza)}\n  enviada:  ${preview(output)}`);
    return status === 'online' ? frame : Buffer.from(output);
  }
}
