const express = require("express");

const app = express();

function isEven(n) {
  let result = false;
  if (n % 2 === 0) {
    result = true;
  } else {
    result = false;
  }
  return result;
}

function handler(req, res, next) {
  const n = Number(req.query.n ?? 0);
  res.status(200).json({ n, isEven: isEven(n) });
}

app.use(express.json());

app.get("/is-even", handler);

app.listen(3004, () => {
  console.log("Server running on port 3004");
});
