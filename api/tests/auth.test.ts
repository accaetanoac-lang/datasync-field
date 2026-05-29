import request from 'supertest';
import app from '../src/app';

jest.mock('../src/db/client', () => ({
  query: jest.fn(),
  queryOne: jest.fn(),
  pool: { connect: jest.fn(), end: jest.fn() },
}));

const { queryOne } = require('../src/db/client');

describe('POST /auth/login', () => {
  beforeEach(() => jest.clearAllMocks());

  it('returns 400 for invalid employee_id format', async () => {
    const res = await request(app).post('/auth/login').send({ employee_id: 'abc' });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/x000000/);
  });

  it('returns 401 for unknown employee_id', async () => {
    queryOne.mockResolvedValueOnce(null);
    const res = await request(app).post('/auth/login').send({ employee_id: 'x000001' });
    expect(res.status).toBe(401);
  });

  it('returns 401 for inactive technician', async () => {
    queryOne.mockResolvedValueOnce({
      id: 1, employee_id: 'x000001', name: 'Test Tech', role: 'technician', active: false,
    });
    const res = await request(app).post('/auth/login').send({ employee_id: 'x000001' });
    expect(res.status).toBe(401);
    expect(res.body.error).toMatch(/deactivated/);
  });

  it('returns JWT token for valid active technician', async () => {
    process.env.JWT_SECRET = 'test_secret';
    queryOne.mockResolvedValueOnce({
      id: 1, employee_id: 'x000001', name: 'Test Tech', role: 'technician', active: true,
    });
    const res = await request(app).post('/auth/login').send({ employee_id: 'x000001' });
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('token');
    expect(res.body.technician.employee_id).toBe('x000001');
  });
});
