import 'dotenv/config';
import express from 'express';
import { lambdaAdapter } from './lambda-adapter';
import { handler as authHandler } from '../handlers/auth/index';
import { handler as ingestionHandler } from '../handlers/ingestion/index';
import { handler as queryHandler } from '../handlers/query/index';

const app = express();
const port = process.env.PORT || 3001;

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Auth routes
app.post('/auth/*', lambdaAdapter(authHandler));

// Ingestion routes
app.post('/invoices/upload', lambdaAdapter(ingestionHandler));
app.post('/invoices/:id/process', lambdaAdapter(ingestionHandler));
app.delete('/invoices/:id', lambdaAdapter(ingestionHandler));

// Query routes
app.get('/invoices', lambdaAdapter(queryHandler));
app.get('/invoices/:id', lambdaAdapter(queryHandler));
app.post('/query', lambdaAdapter(queryHandler));

app.listen(port, () => {
  console.log(`Local API server running on http://localhost:${port}`);
});
