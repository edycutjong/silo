import { app } from './app';

const PORT = process.env.PORT || 3001;

app.listen(PORT, () => {
  console.log(`[Agent Server] Running on http://localhost:${PORT}`);
});
