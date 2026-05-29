import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';

import authRouter from './routes/auth';
import orgsRouter from './routes/orgs';
import machinesRouter from './routes/machines';
import activitiesRouter from './routes/activities';
import uploadRouter from './routes/upload';
import reportsRouter from './routes/reports';
import visitsRouter from './routes/visits';
import techniciansRouter from './routes/technicians';

dotenv.config();

const app = express();

app.use(cors({
  origin: process.env.CORS_ORIGIN ?? '*',
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
}));

app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

app.get('/health', (_req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

app.use('/auth', authRouter);
app.use('/orgs', orgsRouter);
app.use('/machines', machinesRouter);
app.use('/activities', activitiesRouter);
app.use('/upload', uploadRouter);
app.use('/reports', reportsRouter);
app.use('/visits', visitsRouter);
app.use('/technicians', techniciansRouter);

app.use((_req, res) => {
  res.status(404).json({ error: 'Not found' });
});

app.use((err: Error, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  console.error(err);
  res.status(500).json({ error: 'Internal server error' });
});

export default app;
