const express = require("express");
const app = express();

const setupRoutes = require("./routes/setupRoutes");

app.use(express.json());

app.use("/api", setupRoutes);

app.get("/", (req, res) => {
  res.send("API çalışıyor 🚀");
});

app.listen(3000, () => {
  console.log("Server running on port 3000");
});