# Vajra Nyay online backend

GitHub Pages cannot run `server.js`; this folder is the Node backend for Pocket Rights and other API features.

## Deploy on Render
1. Push this `backend` folder to GitHub.
2. In Render, create a **Web Service** from the repository.
3. Root Directory: `backend`
4. Build Command: `npm install`
5. Start Command: `npm start`
6. Add secret environment variable `GROQ_API_KEY` if Groq is to be used. Never put the key in `index.html` or a public GitHub file.
7. After deployment, copy the service URL, e.g. `https://your-service.onrender.com`.
8. On the GitHub Pages app, open the Home API Connection panel and save that backend URL.

## Health check
Open:
`https://YOUR-BACKEND/api/health`

It should return JSON with `ok:true`.
