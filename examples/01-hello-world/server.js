const express = require("express");

const app = express();

app.use(express.json());

app.get("/hello", (req, res) => {
  res.status(200).json({ message: "Hello World" });
});

app.listen(3001, () => {
  console.log("Server running on port 3001");
});
