const express = require("express");
const router = express.Router();
const axios = require("axios");
const runPrediction = require("../services/pythonService");

const GOOGLE_API_KEY = "AIzaSyCKiutF3dUkcr06Vp9pti-ZQzzLvSAuwjI"; // ⚠️ regenerate key (explained below)

router.post("/predict", async (req, res) => {
    try {
        const { battery, fatigue, sleep, start, destination } = req.body;

        const response = await axios.get(
            "https://maps.googleapis.com/maps/api/distancematrix/json",
            {
                params: {
                    origins: start,
                    destinations: destination,
                    key: GOOGLE_API_KEY
                }
            }
        );

        // 🔍 DEBUG
        console.log("GOOGLE RESPONSE:", JSON.stringify(response.data, null, 2));

        // ✅ SAFE CHECK
        if (
            response.data.rows &&
            response.data.rows.length > 0 &&
            response.data.rows[0].elements &&
            response.data.rows[0].elements.length > 0 &&
            response.data.rows[0].elements[0].status === "OK"
        ) {
            const distanceMeters =
                response.data.rows[0].elements[0].distance.value;

            const distanceKm = distanceMeters / 1000;

            const result = await runPrediction({
                battery,
                distance: distanceKm,
                fatigue,
                sleep
            });

            return res.json({
                distance: distanceKm,
                prediction: result
            });
        } else {
            return res.status(400).json({
                error: "Google API issue",
                details: response.data
            });
        }

    } catch (err) {
        console.error("ERROR:", err.message);
        res.status(500).json({ error: "Prediction failed" });
    }
});

module.exports = router;