/**
 * test/notificationService.test.js
 *
 * Unit tests for NotificationService.queueInviteAlert.
 * Uses an in-memory SQLite database so no external infrastructure is needed.
 *
 * Run with:  npx jest test/notificationService.test.js
 */

const { Sequelize } = require('sequelize');
const { DataTypes } = require('sequelize');

// ── Build an isolated in-memory DB + Notification model for each test suite ──
let sequelize;
let Notification;
let notificationService;

beforeAll(async () => {
  sequelize = new Sequelize({ dialect: 'sqlite', storage: ':memory:', logging: false });

  Notification = sequelize.define('Notification', {
    id:         { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    userId:     { type: DataTypes.INTEGER, allowNull: false },
    type:       { type: DataTypes.STRING(64), allowNull: false },
    payload:    { type: DataTypes.TEXT, allowNull: false, defaultValue: '{}' },
    status:     { type: DataTypes.ENUM('PENDING', 'SENT', 'FAILED'), defaultValue: 'PENDING' },
    sentAt:     { type: DataTypes.DATE, allowNull: true },
    retryCount: { type: DataTypes.INTEGER, defaultValue: 0 },
    lastError:  { type: DataTypes.TEXT, allowNull: true },
  }, { tableName: 'Notifications', timestamps: true });

  await sequelize.sync();

  // Inject the test model into the module registry so notificationService
  // picks it up instead of the real one.
  jest.mock('../models', () => ({ Notification }));

  notificationService = require('../services/notificationService');
});

afterEach(async () => {
  await Notification.destroy({ where: {} });
  global.io = undefined;
});

afterAll(async () => {
  await sequelize.close();
});

// ── Helpers ───────────────────────────────────────────────────────────────────

async function allNotifications() {
  return Notification.findAll();
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('NotificationService.queueInviteAlert', () => {

  test('creates exactly one notification row per call', async () => {
    await notificationService.queueInviteAlert(42, 7, 101);

    const rows = await allNotifications();
    expect(rows).toHaveLength(1);
  });

  test('notification payload contains invitationId and groupId', async () => {
    await notificationService.queueInviteAlert(42, 7, 101);

    const [row] = await allNotifications();
    const payload = JSON.parse(row.payload);

    expect(payload.invitationId).toBe(101);
    expect(payload.groupId).toBe(7);
  });

  test('notification type is GROUP_INVITE', async () => {
    await notificationService.queueInviteAlert(42, 7, 101);

    const [row] = await allNotifications();
    expect(row.type).toBe('GROUP_INVITE');
  });

  test('notification targets the correct user (targetId → userId)', async () => {
    await notificationService.queueInviteAlert(42, 7, 101);

    const [row] = await allNotifications();
    expect(row.userId).toBe(42);
  });

  test('emits notification:new over WebSocket when io is available', async () => {
    const emitMock = jest.fn();
    const toMock = jest.fn(() => ({ emit: emitMock }));
    global.io = { to: toMock };

    await notificationService.queueInviteAlert(42, 7, 101);

    expect(toMock).toHaveBeenCalledWith('user:42');
    expect(emitMock).toHaveBeenCalledWith(
      'notification:new',
      expect.objectContaining({
        type: 'GROUP_INVITE',
        payload: { invitationId: 101, groupId: 7 },
      }),
    );
  });

  test('does NOT throw when io is unavailable (no WebSocket server)', async () => {
    global.io = undefined;

    await expect(
      notificationService.queueInviteAlert(42, 7, 101),
    ).resolves.not.toThrow();
  });

  test('flags notification as FAILED when WebSocket push throws', async () => {
    global.io = {
      to: () => ({
        emit: () => { throw new Error('socket error'); },
      }),
    };

    await notificationService.queueInviteAlert(42, 7, 101);

    const [row] = await allNotifications();
    expect(row.status).toBe('FAILED');
    expect(row.retryCount).toBe(1);
    expect(row.lastError).toMatch('socket error');
  });

  test('D8 record is unaffected when notification fails (no rollback)', async () => {
    // Simulate DB Notification.create failure
    const original = Notification.create.bind(Notification);
    jest.spyOn(Notification, 'create').mockRejectedValueOnce(new Error('DB error'));

    // Should not throw
    await expect(
      notificationService.queueInviteAlert(42, 7, 101),
    ).resolves.not.toThrow();

    // No notification row was created (expected), and no exception propagated
    const rows = await allNotifications();
    expect(rows).toHaveLength(0);

    Notification.create = original;
  });

  test('multiple invitations each receive exactly one notification', async () => {
    await Promise.all([
      notificationService.queueInviteAlert(10, 7, 201),
      notificationService.queueInviteAlert(11, 7, 202),
      notificationService.queueInviteAlert(12, 7, 203),
    ]);

    const rows = await allNotifications();
    expect(rows).toHaveLength(3);

    const userIds = rows.map((r) => r.userId).sort();
    expect(userIds).toEqual([10, 11, 12]);
  });
});
