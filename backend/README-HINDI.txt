VAJRA NYAY BACKEND - SETUP

1. Is folder ko VS Code/Terminal me kholo.
2. Node.js install hona chahiye.
3. Terminal:
   npm install
   npm start
4. Browser me kholo:
   http://localhost:3000
5. API health:
   http://localhost:3000/api/health

API:
POST /api/complaints/submit
GET  /api/complaints
GET  /api/complaints/status/:id
PATCH /api/complaints/status/:id
GET  /api/map

IMPORTANT:
- Government API abhi DEMO/OFF mode me hai.
- Official authorization/API docs milne ke baad .env me endpoint/key server side par set karna hai.
- API key ko index.html me kabhi mat rakhna.
- Public map me vyakti ki private identity expose na karein.
- Bribery map complaint/allegation ko dikhata hai; use proven corruption ke roop me label na karein jab tak verification na ho.
