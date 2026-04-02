const { spawn } = require("child_process");
const runPrediction = (data) => {
    return new Promise((resolve, reject) => {
        const py = spawn("python", [
            "prediction/prediction.py",
            JSON.stringify(data)
        ]);
        let result = "";
        py.stdout.on("data", (data) => {
            result += data.toString();
        });
        py.stderr.on("data", (err) => {
            console.error("Python Error:", err.toString());
        });
        py.on("close", () => {
            resolve(JSON.parse(result));
        });
    });
};
module.exports = runPrediction;