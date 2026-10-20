/** Limita uma stanza, não o tamanho de uma leitura TCP com várias stanzas. */
export const MAX_STANZA_BYTES = 1024 * 1024;
const MAX_DEPTH = 64;

/**
 * Erro de enquadramento com os bytes já liberados e os ainda retidos, para quem
 * prefere repassar o fluxo cru a derrubar a conexão (sentido servidor → cliente).
 */
export class XmppFrameError extends Error {
  constructor(message: string, readonly partial: Buffer[], readonly leftover: Buffer) {
    super(message);
  }
}

/**
 * Enquadra XML sem decodificar UTF-8. O stream XMPP fica aberto e pode reiniciar
 * após SASL; cada stanza, comentário e declaração mantém seus bytes exatos.
 * A interpretação e validação da presença ficam a cargo do parser XML.
 */
export class XmppFramer {
  private buffer: Buffer = Buffer.alloc(4096);
  private length = 0;
  private cursor = 0;
  private consumed = 0;
  private tokenStart = -1;
  private mode: 'tag' | 'comment' | 'cdata' | 'pi' | null = null;
  private quote = 0;
  private readonly elements: string[] = [];
  private failed = false;

  constructor(private readonly maxStanzaBytes = MAX_STANZA_BYTES) {}

  push(chunk: Buffer): Buffer[] {
    if (this.failed) throw new Error('Fluxo XMPP já encerrado por erro.');
    const output: Buffer[] = [];
    let offset = 0;
    try {
      while (offset < chunk.length) {
        const size = Math.min(chunk.length - offset, this.maxStanzaBytes - this.length);
        if (size === 0) throw new Error('Stanza XMPP excedeu o limite de tamanho.');
        if (this.length + size > this.buffer.length) {
          const next = Buffer.alloc(Math.min(this.maxStanzaBytes, Math.max(this.buffer.length * 2, this.length + size)));
          this.buffer.copy(next, 0, 0, this.length);
          this.buffer = next;
        }
        chunk.copy(this.buffer, this.length, offset, offset + size);
        this.length += size;
        offset += size;
        this.scan(output);
        if (this.consumed) {
          this.buffer.copy(this.buffer, 0, this.consumed, this.length);
          this.length -= this.consumed;
          this.cursor -= this.consumed;
          if (this.tokenStart >= 0) this.tokenStart -= this.consumed;
          this.consumed = 0;
        }
      }
      return output;
    } catch (error) {
      this.failed = true;
      const leftover = Buffer.concat([this.buffer.subarray(this.consumed, this.length), chunk.subarray(offset)]);
      throw new XmppFrameError(error instanceof Error ? error.message : String(error), output, leftover);
    }
  }

  end(): void {
    if (this.failed || this.length || this.elements.length || this.tokenStart >= 0) {
      throw new Error('Fluxo XMPP incompleto; presença pendente descartada.');
    }
  }

  private emit(output: Buffer[]): void {
    if (this.cursor > this.consumed) {
      output.push(Buffer.from(this.buffer.subarray(this.consumed, this.cursor)));
      this.consumed = this.cursor;
    }
  }

  private scan(output: Buffer[]): void {
    while (this.cursor < this.length) {
      if (this.tokenStart < 0) {
        if (this.buffer[this.cursor] !== 60) {
          if (!this.elements.length && ![9, 10, 13, 32].includes(this.buffer[this.cursor])) {
            throw new Error('Texto fora de uma stanza XMPP.');
          }
          this.cursor++;
          continue;
        }
        if (!this.elements.length) this.emit(output);
        this.tokenStart = this.cursor;
        this.mode = null;
        this.quote = 0;
      }

      if (!this.mode) {
        const prefix = this.buffer.subarray(this.tokenStart, Math.min(this.length, this.tokenStart + 9)).toString('ascii');
        if (prefix.length < 2) return;
        if (prefix.startsWith('<?')) {
          this.mode = 'pi';
          this.cursor = this.tokenStart + 2;
        } else if (prefix.startsWith('<!')) {
          if (prefix.length < 4 && '<!--'.startsWith(prefix)) return;
          if (prefix.length < 9 && '<![CDATA['.startsWith(prefix)) return;
          if (prefix.startsWith('<!--')) this.mode = 'comment';
          else if (prefix.startsWith('<![CDATA[')) {
            if (!this.elements.length) throw new Error('CDATA fora de uma stanza XMPP.');
            this.mode = 'cdata';
          } else throw new Error('Declaração XML não permitida no chat.');
          this.cursor = this.tokenStart + (this.mode === 'comment' ? 4 : 9);
        } else {
          this.mode = 'tag';
          this.cursor = this.tokenStart + 1;
        }
      }

      let complete = false;
      while (this.cursor < this.length) {
        const byte = this.buffer[this.cursor++];
        if (this.mode === 'tag') {
          if (this.quote) {
            if (byte === this.quote) this.quote = 0;
          } else if (byte === 34 || byte === 39) this.quote = byte;
          else if (byte === 62) complete = true;
        } else if (byte === 62) {
          const previous = this.buffer[this.cursor - 2];
          complete = this.mode === 'pi'
            ? previous === 63
            : this.cursor >= this.tokenStart + 3 &&
              previous === (this.mode === 'comment' ? 45 : 93) &&
              this.buffer[this.cursor - 3] === previous;
        }
        if (complete) break;
      }
      if (!complete) return;
      if (this.mode === 'tag') this.acceptTag();
      this.tokenStart = -1;
      this.mode = null;
      if (!this.elements.length) this.emit(output);
    }
    if (this.tokenStart < 0 && !this.elements.length) this.emit(output);
  }

  private acceptTag(): void {
    const tag = this.buffer.subarray(this.tokenStart, this.cursor).toString('utf8');
    const match = /^<(\/?)([^\s/>]+)(?:[\s/>])/.exec(tag);
    if (!match) throw new Error('Tag XMPP inválida.');
    const [, closing, name] = match;
    // O elemento raiz do protocolo é deliberadamente deixado aberto.
    if (!this.elements.length && name.split(':').pop() === 'stream') return;
    if (closing) {
      if (this.elements.pop() !== name) throw new Error('Tags XMPP não correspondem.');
    } else if (!/\/>$/.test(tag)) {
      this.elements.push(name);
      if (this.elements.length > MAX_DEPTH) throw new Error('XML do chat profundo demais.');
    }
  }
}
