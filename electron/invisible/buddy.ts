import { randomUUID } from 'node:crypto';

/** Como os amigos veem você: `show` do XMPP é chat/offline/mobile. */
export type ChatStatus = 'online' | 'offline' | 'mobile';

export interface InvisibleState {
  /** Desligado, a presença real passa sem alteração (você aparece online). */
  enabled: boolean;
  status: ChatStatus;
  /** Desligado, presenças para salas (lobby, seleção) também são retidas. */
  lobbyChat: boolean;
}

export function effectiveStatus(state: InvisibleState): ChatStatus {
  return state.enabled ? state.status : 'online';
}

/**
 * Contato local inserido na lista de amigos, como o "Deceive Active!". Nunca
 * chega à Riot: o proxy retém tudo que o Riot Client envia para este JID.
 */
export const BUDDY_ID = '7f3c2a91-4b6e-4d1f-9c8a-5e2b7d0a6c13';
const BUDDY_JID = `${BUDDY_ID}@eu1.pvp.net`;
// O TAB inicial coloca o contato no topo da lista, em ordem alfabética.
const BUDDY_NAME = '&#9;Rift Companion';

const STATUS_TEXT: Record<ChatStatus, string> = {
  online: 'online',
  offline: 'offline',
  mobile: 'no celular',
};

export function statusLine(state: InvisibleState): string {
  if (!state.enabled) return 'Modo invisível desativado: você aparece online normalmente.';
  return `Você aparece ${STATUS_TEXT[state.status]} para os amigos.`;
}

/** Texto curto do status do contato na lista de amigos. */
function buddyStatusText(state: InvisibleState): string {
  if (!state.enabled) return 'Invisível desativado';
  return { online: 'Você: online', offline: 'Você: offline', mobile: 'Você: no celular' }[state.status];
}

export const HELP_TEXT =
  'Comandos: offline · celular · online · ativar · desativar · sala (liga/desliga o chat de sala) · status · ajuda';

export function introduction(state: InvisibleState): string[] {
  return [
    `Olá! O Rift Companion está protegendo seu status. ${statusLine(state)}`,
    'O seu cliente continua mostrando você como online, mas é assim que os amigos te veem.',
    'Para convidar alguém estando offline, pode ser preciso ficar online até a pessoa entrar no grupo.',
    `Troque o status pelo ícone do Rift Companion na bandeja, nas configurações do app ou respondendo aqui. ${HELP_TEXT}`,
  ];
}

export type BuddyCommand =
  | { kind: 'change'; changes: Partial<InvisibleState> }
  | { kind: 'toggle-lobby' }
  | { kind: 'status' }
  | { kind: 'help' };

/** Interpreta uma mensagem enviada ao contato (português ou inglês, sem acentos). */
export function parseCommand(text: string): BuddyCommand {
  const words = text.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().split(/[^a-z]+/);
  const has = (...options: string[]) => options.some((option) => words.includes(option));
  // "desativar" antes de "ativar"; "offline" antes de "online".
  if (has('desativar', 'desligar', 'disable', 'off')) return { kind: 'change', changes: { enabled: false } };
  if (has('offline', 'invisivel', 'oculto')) return { kind: 'change', changes: { enabled: true, status: 'offline' } };
  if (has('celular', 'mobile', 'movel')) return { kind: 'change', changes: { enabled: true, status: 'mobile' } };
  if (has('online')) return { kind: 'change', changes: { enabled: true, status: 'online' } };
  if (has('ativar', 'ligar', 'enable', 'on')) return { kind: 'change', changes: { enabled: true } };
  if (has('sala', 'salas', 'lobby', 'muc')) return { kind: 'toggle-lobby' };
  if (has('status')) return { kind: 'status' };
  return { kind: 'help' };
}

function escapeXml(text: string): string {
  return text.replace(/[&<>"']/g, (char) => `&#${char.charCodeAt(0)};`);
}

/** Item do roster inserido logo após `<query xmlns='jabber:iq:riotgames:roster'>`. */
export function rosterItem(): string {
  return `<item jid='${BUDDY_JID}' name='${BUDDY_NAME}' subscription='both' puuid='${BUDDY_ID}'>` +
    `<group priority='9999'>Rift Companion</group><state>online</state>` +
    `<id name='${BUDDY_NAME}' tagline='RIFT'/><lol name='${BUDDY_NAME}'/>` +
    `<platforms><riot name='${BUDDY_NAME}' tagline='RIFT'/></platforms></item>`;
}

/** Presença do contato: sempre online, com o seu status atual como recado. */
export function buddyPresence(state: InvisibleState): string {
  const now = Date.now();
  const text = escapeXml(buddyStatusText(state));
  return `<presence from='${BUDDY_JID}/RC-Rift' id='rift-${randomUUID()}'><games>` +
    `<keystone><st>chat</st><s.t>${now}</s.t><s.p>keystone</s.p><pty/></keystone>` +
    // Sem s.r: o contato fica na categoria "League" em vez de "Outros servidores".
    `<league_of_legends><st>chat</st><s.t>${now}</s.t><m>${text}</m><s.p>league_of_legends</s.p>` +
    `<s.c>live</s.c><p>{&quot;pty&quot;:true}</p></league_of_legends>` +
    `</games><show>chat</show><platform>riot</platform><status>${text}</status></presence>`;
}

export function buddyMessage(body: string): string {
  // Um segundo à frente, como o Deceive, para não ficar atrás da mensagem que o motivou.
  const stamp = new Date(Date.now() + 1000).toISOString().replace('T', ' ').replace('Z', '');
  return `<message from='${BUDDY_JID}/RC-Rift' stamp='${stamp}' id='rift-${randomUUID()}' type='chat'>` +
    `<body>${escapeXml(body)}</body></message>`;
}
