import 'dotenv/config';

import express from 'express';
import cors from 'cors';
import session from 'express-session';
import MongoStore from 'connect-mongo';
import morgan from 'morgan';

import Credentials from './config/Credentials.js';
import connectDB from './config/db.js';
import { initWebSocket } from './config/ws-server.js';
import apiRouter from './routes/routes.js';
import logger from './utils/logger.js';

const app = express();

app.set('trust proxy', 1);

app.use(cors({
  origin: Credentials.FRONTEND_URL,
  credentials: true,
}));

app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));
app.use(morgan('dev'));

const sessionConfig = {
  secret: Credentials.SESSION_SECRET || 'dev-secret-change-me',
  resave: false,
  saveUninitialized: false,
  cookie: {
    secure: Credentials.NODE_ENV === 'production',
    httpOnly: true,
    maxAge: 1000 * 60 * 60 * 24 * 7,
  },
};

if (Credentials.MONGO_URI) {
  sessionConfig.store = MongoStore.create({ mongoUrl: Credentials.MONGO_URI });
}

app.use(session(sessionConfig));

app.use('/uploads', express.static('uploads'));

app.use('/api', apiRouter);

app.use((err, req, res, next) => {
  logger.error(err.stack || err.message || err);
  res.status(500).json({ error: 'Internal server error' });
});

async function bootstrap() {
  try {
    await connectDB();

    const PORT = Credentials.PORT;
    const server = app.listen(PORT, () => {
      logger.info(`Server running on port ${PORT} [${Credentials.NODE_ENV}]`);
    });

    server.keepAliveTimeout = 120_000;
    server.headersTimeout = 121_000;

    initWebSocket(server);
  } catch (err) {
    logger.error('Failed to start server:', err);
    process.exit(1);
  }
}

bootstrap();
