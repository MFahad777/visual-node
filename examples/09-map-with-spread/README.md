# Map with Spread Operator Example

Demonstrates the **Array Map** loop node with object cloning and modification.

## What it does

An `applyDiscount()` function that takes an array of product objects and returns a new array where each product's price is reduced by 10% using the spread operator.

```javascript
applyDiscount([
  { name: "Laptop", price: 1000 },
  { name: "Phone", price: 500 }
])
// returns [
//   { name: "Laptop", price: 900 },
//   { name: "Phone", price: 450 }
// ]
```

## Visual Flow

- **Map Node**: Iterates over the input array
- **Custom Code**: Uses spread operator to clone each object and modify the price
- **Return Node**: Captures the mapped result

This example demonstrates more complex transformations using the spread operator and calculated values.
