import { rosterItem } from './buddy';
import { XmppFrameError, XmppFramer } from './xmpp';

/** O roster completo pode ser grande; o limite só protege a memória. */
const MAX_SERVER_STANZA_BYTES = 16 * 1024 * 1024;
const ROSTER_NAMESPACE = Buffer.from('jabber:iq:riotgames:roster');
const ROSTER_QUERY = /<((?:[\w.-]+:)?query)\b[^>]*\bxmlns=(['"])jabber:iq:riotgames:roster\2[^>]*?(\/?)>/;

/**
 * Sentido servidor → cliente. Enquadra o fluxo para inserir o contato Rift
 * Companion no primeiro roster e permitir mensagens locais só entre stanzas.
 * Se o XML fugir do esperado, passa a repassar os bytes crus: aqui não há dado
 * a proteger, e derrubar o chat seria pior que perder o contato.
 */
export class ServerStreamRelay {
  private readonly framer = new XmppFramer(MAX_SERVER_STANZA_BYTES);
  private raw = false;
  private rosterInjected = false;

  constructor(
    private readonly onRoster: () => void = () => undefined,
    private readonly log: (line: string) => void = () => undefined,
  ) {}

  /** Mensagens locais só podem entrar quando o contato está no roster e o fluxo está enquadrado. */
  get ready(): boolean {
    return this.rosterInjected && !this.raw;
  }

  push(chunk: Buffer): Buffer[] {
    if (this.raw) return [chunk];
    let frames: Buffer[];
    try {
      frames = this.framer.push(chunk);
    } catch (error) {
      this.raw = true;
      this.log(`fluxo do servidor fora do esperado; contato desativado nesta conexão (${error instanceof Error ? error.message : error})`);
      if (error instanceof XmppFrameError) return [...error.partial, error.leftover].filter((part) => part.length);
      return [chunk];
    }
    if (this.rosterInjected) return frames;
    return frames.map((frame) => this.injectRoster(frame));
  }

  private injectRoster(frame: Buffer): Buffer {
    if (this.rosterInjected || !frame.includes(ROSTER_NAMESPACE)) return frame;
    const stanza = frame.toString('utf8');
    // Só o resultado da consulta inicial; pushes posteriores do roster não.
    if (!/^<(?:[\w.-]+:)?iq\b[^>]*\btype=(['"])result\1/.test(stanza)) return frame;
    const match = ROSTER_QUERY.exec(stanza);
    if (!match) return frame;
    const [opening, name, , selfClosing] = match;
    const at = match.index + opening.length;
    const patched = selfClosing
      ? stanza.slice(0, match.index) + opening.replace(/\s*\/>$/, '>') + rosterItem() + `</${name}>` + stanza.slice(at)
      : stanza.slice(0, at) + rosterItem() + stanza.slice(at);
    this.rosterInjected = true;
    this.log('contato Rift Companion inserido na lista de amigos');
    queueMicrotask(this.onRoster);
    return Buffer.from(patched);
  }
}
