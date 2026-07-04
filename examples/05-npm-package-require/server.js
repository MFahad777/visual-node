const express = require("express");
const uuid = require("uuid");

const app = express();

app.use(express.json());

app.get("/id", async (req, res) => {
  await new Promise((resolve) => setTimeout(resolve, 5));
  res
    .status(200)
    .json({ id: uuid.v4(), generatedAt: new Date().toISOString() });
});

app.listen(3005, () => {
  console.log("Server running on port 3005");
});
