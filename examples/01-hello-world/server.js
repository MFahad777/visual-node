const express = require("express");

const app = express();

function handler(req, res, next) {
  res.status(200).json({ message: "Hello World" });
}

app.use(express.json());

app.get("/hello", handler);

app.listen(3001, () => {
  console.log("Server running on port 3001");
});
