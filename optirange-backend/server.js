const express = require("express");
const cors = require("cors");
const predictRoutes = require("./routes/predict");
const app = express();

// Middleware
app.use(cors());
app.use(express.json());
app.use("/api", predictRoutes);

// Test Route
app.get("/", (req, res) => {
    res.send("Backend is running 🚀");
});

// Start server
const PORT = 5000;
app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
});