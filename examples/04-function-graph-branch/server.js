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

app.use(express.json());

app.get("/is-even", (req, res) => {
  const n = Number(req.query.n ?? 0);
  res.status(200).json({ n, isEven: isEven(n) });
});

app.listen(3004, () => {
  console.log("Server running on port 3004");
});
