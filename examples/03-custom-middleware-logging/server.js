const express = require("express");

const app = express();

function handler(req, res, next) {
  res.status(200).json({ pong: true });
}

app.use((req, res, next) => {
  console.log(`${req.method} ${req.path}`);
  next();
});

app.use(express.json());

app.get("/ping", handler);

app.listen(3003, () => {
  console.log("Server running on port 3003");
});
