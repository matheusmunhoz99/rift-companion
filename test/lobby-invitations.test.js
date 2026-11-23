const assert = require('node:assert/strict');
const { test } = require('node:test');
const { toReceivedInvitations } = require('../dist-electron/lcu/lobby.js');

test('convites recebidos: só os que ainda esperam resposta aparecem', () => {
  const invitations = toReceivedInvitations([
    {
      invitationId: 'abc-123',
      fromSummonerId: 42,
      fromSummonerName: 'Fulano',
      state: 'Pending',
      canAcceptInvitation: true,
      gameConfig: { queueId: 420 },
    },
    { invitationId: 'def-456', fromSummonerName: 'Já aceito', state: 'Accepted' },
    { invitationId: 'ghi-789', fromSummonerName: 'Recusado', state: 'Declined' },
    { invitationId: 'jkl-012', fromSummonerName: 'Expirou', state: 'Expired' },
  ]);

  assert.equal(invitations.length, 1);
  assert.deepEqual(invitations[0], {
    invitationId: 'abc-123',
    fromSummonerId: 42,
    fromName: 'Fulano',
    queueId: 420,
    canAccept: true,
  });
});

test('convites recebidos: aguenta lista vazia, nula e campos faltando', () => {
  assert.deepEqual(toReceivedInvitations(null), []);
  assert.deepEqual(toReceivedInvitations([]), []);

  // Sem invitationId não dá para responder: fica de fora.
  assert.deepEqual(toReceivedInvitations([{ state: 'Pending', fromSummonerName: 'Sem id' }]), []);

  const [invitation] = toReceivedInvitations([{ invitationId: 'x', state: 'Pending' }]);
  assert.equal(invitation.fromName, '');
  assert.equal(invitation.fromSummonerId, 0);
  assert.equal(invitation.queueId, 0);
  // Quando o cliente não diz nada, o convite vale como aceitável.
  assert.equal(invitation.canAccept, true);
});

test('convites recebidos: canAccept false quando o cliente barra o aceite', () => {
  const [invitation] = toReceivedInvitations([
    { invitationId: 'x', state: 'Pending', canAcceptInvitation: false },
  ]);
  assert.equal(invitation.canAccept, false);
});
