import winston from 'winston';
import DailyRotateFile from 'winston-daily-rotate-file';
import Credentials from '../config/Credentials.js';

const { combine, timestamp, printf, colorize, simple } = winston.format;

const customFormat = printf(({ level, message, timestamp }) => {
  return `${timestamp} [${level}]: ${message}`;
});

const transports = [];

if (Credentials.NODE_ENV === 'production') {
  transports.push(
    new DailyRotateFile({
      filename: 'logs/combined-%DATE%.log',
      datePattern: 'YYYY-MM-DD',
      maxSize: '20m',
      maxFiles: '14d',
    }),
    new DailyRotateFile({
      filename: 'logs/error-%DATE%.log',
      datePattern: 'YYYY-MM-DD',
      level: 'error',
      maxSize: '20m',
      maxFiles: '30d',
    }),
  );
} else {
  transports.push(
    new winston.transports.Console({
      format: combine(colorize(), simple()),
    }),
  );
}

const logger = winston.createLogger({
  level: 'info',
  format: combine(timestamp(), customFormat),
  transports,
});

export default logger;
