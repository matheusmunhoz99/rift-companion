import { Component, DestroyRef, inject, signal } from '@angular/core';
import { isAndroid, pairPhone, phoneError, phoneStatus, unlinkPhone } from './mobile-client';

interface Device { id: string; name: string; approved: number; created: number }
declare global {
  interface Window {
    mobile?: {
      pair(): Promise<{ image: string; text: string; expires: number }>;
      devices(): Promise<{ devices: Device[]; error: string | null }>;
      approve(id: string): Promise<void>;
      revoke(id: string): Promise<void>;
    };
  }
}

@Component({
  selector: 'app-mobile-link',
  template: `
    <section class="card link-card">
      <span class="eyebrow">RIFT COMPANION · {{ android ? 'ANDROID' : 'DISPOSITIVOS' }}</span>
      <h2>{{ android ? (status() === 'online' ? 'Conexão do celular' : 'Seu LoL, na palma da mão.') : 'Conectar celular Android' }}</h2>
      @if (android) {
        @if (status() !== 'online') {
          <p>Mesmas builds, partidas e controle do cliente. Seu PC executa; você acompanha pelo celular.</p>
        }
        @switch (status()) {
          @case ('unlinked') {
            <ol><li>Abra o Rift Companion no Windows.</li><li>Em Configurações, toque em Gerar QR Code.</li><li>Leia o código e confirme o aparelho no PC.</li></ol>
            <label>Nome deste celular<input class="input" maxlength="60" [value]="name()" (input)="name.set($any($event.target).value)" /></label>
            <button class="btn big" [disabled]="busy()" (click)="scan()">Ler QR Code do PC</button>
            <details><summary>Vincular com código copiado</summary>
              <label>Código de vinculação<input class="input" autocomplete="off" [value]="code()" (input)="code.set($any($event.target).value)" /></label>
              <button class="btn ghost" [disabled]="busy() || !code()" (click)="connect(code())">Vincular</button>
            </details>
          }
          @case ('waiting') { <p class="notice">QR Code lido. Confirme <strong>{{ name() }}</strong> nas Configurações do PC. A solicitação expira em 2 minutos.</p> }
          @case ('offline') { <p class="notice">PC desconectado. Mantenha o Rift Companion aberto no Windows e os dois aparelhos com internet. A reconexão é automática.</p> }
          @case ('online') { <p class="notice">Celular vinculado. As ações nesta tela controlam o seu PC.</p> }
        }
        @if (status() !== 'unlinked') { <button class="btn ghost" [disabled]="busy()" (click)="unlink()">Desvincular este celular</button> }
        @if (remoteError()) { <p class="error" role="alert">{{ remoteError() }}</p> }
        <small>O controle funciona com o APK aberto. O app não controla movimentos do campeão nem joga por você.</small>
      } @else {
        <p>Controle sala, fila, seleção e acompanhe suas partidas pelo APK. Até 5 aparelhos, com aprovação individual.</p>
        <button class="btn" [disabled]="busy()" (click)="generate()">Gerar QR Code</button>
        @if (pair(); as p) {
          @if (now() < p.expires) {
            <img class="qr" [src]="p.image" alt="QR Code temporário para vincular o Android" />
            <p>Expira em {{ seconds(p.expires) }} s. Não compartilhe este código.</p>
            <details><summary>Copiar código manualmente</summary><input class="input" readonly [value]="p.text" (focus)="$any($event.target).select()" /></details>
          } @else { <p>QR Code expirado. Gere outro para conectar.</p> }
        }
        @for (device of devices(); track device.id) {
          <div class="device"><div><strong>{{ device.name }}</strong><small>{{ device.approved ? 'Vinculado' : 'Solicitando acesso — confirme apenas se foi você' }}</small></div>
            @if (!device.approved) { <button class="btn small" [disabled]="busy()" (click)="approve(device.id)">Permitir</button> }
            <button class="btn ghost small" [disabled]="busy()" (click)="revoke(device.id)">{{ device.approved ? 'Revogar' : 'Recusar' }}</button>
          </div>
        }
        <small>O servidor intermedeia os comandos por HTTPS. A senha local do LoL e a chave da Riot não são enviadas ao celular.</small>
      }
      @if (error()) { <p class="error" role="alert">{{ error() }}</p> }
    </section>
  `,
  styles: `
    :host { display:block; min-width:0; }
    .link-card { display:grid; gap:16px; padding:24px; }
    h2,p { margin:0; } h2 { font:600 28px var(--font-display); } p,li,small { line-height:1.5; color:var(--muted); }
    .eyebrow { color:var(--accent); font-size:11px; font-weight:700; letter-spacing:1.6px; }
    label { display:grid; gap:8px; } ol { padding-left:20px; margin:0; } li+li { margin-top:8px; }
    .qr { width:min(100%,280px); border-radius:12px; background:white; }
    .notice { background:var(--well); padding:16px; border-left:3px solid var(--accent); border-radius:8px; }
    .device { display:flex; gap:10px; align-items:center; flex-wrap:wrap; padding:12px; background:var(--well); border-radius:8px; }
    .device>div { flex:1; min-width:130px; } small { display:block; } .error { color:var(--danger); overflow-wrap:anywhere; }
    details { min-width:0; } summary { cursor:pointer; color:var(--muted); margin-bottom:12px; }
  `,
})
export class MobileLink {
  protected readonly android = isAndroid;
  protected readonly status = phoneStatus;
  protected readonly remoteError = phoneError;
  protected readonly name = signal('Meu Android');
  protected readonly code = signal('');
  protected readonly busy = signal(false);
  protected readonly error = signal('');
  protected readonly now = signal(Date.now());
  protected readonly pair = signal<{ image: string; text: string; expires: number } | null>(null);
  protected readonly devices = signal<Device[]>([]);
  private refreshing = false;
  constructor() {
    const timer = setInterval(() => { this.now.set(Date.now()); if (!this.android) void this.refresh(); }, 2_000);
    inject(DestroyRef).onDestroy(() => clearInterval(timer));
    if (!this.android) void this.refresh();
  }
  protected seconds(expires: number): number { return Math.max(0, Math.ceil((expires - this.now()) / 1000)); }
  protected async scan(): Promise<void> {
    await this.run(async () => {
      const { CapacitorBarcodeScanner, CapacitorBarcodeScannerTypeHint } = await import('@capacitor/barcode-scanner');
      const result = await CapacitorBarcodeScanner.scanBarcode({ hint: CapacitorBarcodeScannerTypeHint.QR_CODE, scanInstructions: 'Leia o QR Code do Rift Companion no PC', scanText: 'Ler QR Code' });
      await pairPhone(result.ScanResult, this.name());
    });
  }
  protected connect(text: string): Promise<void> { return this.run(() => pairPhone(text, this.name())); }
  protected unlink(): Promise<void> { return this.run(() => unlinkPhone()); }
  protected generate(): Promise<void> { return this.run(async () => { this.pair.set(await window.mobile!.pair()); }); }
  protected approve(id: string): Promise<void> { return this.run(async () => { await window.mobile!.approve(id); await this.refresh(); }); }
  protected revoke(id: string): Promise<void> { return this.run(async () => { await window.mobile!.revoke(id); await this.refresh(); }); }
  private async refresh(): Promise<void> {
    if (!window.mobile || this.refreshing) return;
    this.refreshing = true;
    try { const value = await window.mobile.devices(); this.devices.set(value.devices); if (value.error) this.error.set(value.error); }
    catch (error) { this.error.set(error instanceof Error ? error.message : 'Sem conexão.'); }
    finally { this.refreshing = false; }
  }
  private async run(action: () => Promise<void>): Promise<void> {
    this.busy.set(true); this.error.set('');
    try { await action(); } catch (error) { this.error.set(error instanceof Error ? error.message : 'Não foi possível concluir.'); }
    finally { this.busy.set(false); }
  }
}
