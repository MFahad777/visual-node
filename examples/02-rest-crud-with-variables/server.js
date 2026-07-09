const express = require("express");

const app = express();

let items = [];

function listItems(req, res, next) {
  res.status(200).json(items);
}

function createItem(req, res, next) {
  const item = { id: String(items.length + 1), ...req.body };
  items.push(item);
  res.status(201).json(item);
}

function deleteItem(req, res, next) {
  items = items.filter((item) => item.id !== req.params.id);
  res.status(200).json({ success: true });
}

function countItems(req, res, next) {
  console.log("items snapshot:", items);
  res.status(200).json({ count: items.length });
}

app.use(express.json());

app.get("/items", listItems);

app.post("/items", createItem);

app.delete("/items/:id", deleteItem);

app.get("/items/count", countItems);

app.listen(3002, () => {
  console.log("Server running on port 3002");
});
