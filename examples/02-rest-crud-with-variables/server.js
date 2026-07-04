const express = require("express");

const app = express();

let items = [];

app.use(express.json());

app.get("/items", (req, res) => {
  res.status(200).json(items);
});

app.post("/items", (req, res) => {
  const item = { id: String(items.length + 1), ...req.body };
  items.push(item);
  res.status(201).json(item);
});

app.delete("/items/:id", (req, res) => {
  items = items.filter((item) => item.id !== req.params.id);
  res.status(200).json({ success: true });
});

app.get("/items/count", (req, res) => {
  console.log(items);
  res.status(200).json({ count: items.length });
});

app.listen(3002, () => {
  console.log("Server running on port 3002");
});
