declare module '@blamejs/pki' {
  interface OpenedPkcs12 {
    keys: Array<{ pkcs8: Buffer }>;
    certs: Array<{ cert: Buffer }>;
  }

  const pki: {
    pkcs12: {
      open(
        pfx: Buffer,
        password: string,
        options: { keys: 'der' },
      ): Promise<OpenedPkcs12>;
    };
  };

  export default pki;
}
