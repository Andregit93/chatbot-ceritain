require('dotenv').config();
const { GoogleGenerativeAI } = require('@google/generative-ai');

async function listAllModels() {
    try {
        const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
        // fetch directly using fetch to v1beta listModels
        const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models?key=${process.env.GEMINI_API_KEY}`);
        const data = await response.json();
        
        console.log("=== Model Tersedia di v1beta ===");
        if (data.models) {
            const liteModels = data.models.filter(m => m.name.includes('lite') || m.name.includes('3.1'));
            liteModels.forEach(m => console.log(m.name, m.displayName));
            if (liteModels.length === 0) {
                 console.log("Tidak ada model lite atau 3.1 di v1beta.");
            }
        } else {
            console.log(data);
        }

        const responseAlpha = await fetch(`https://generativelanguage.googleapis.com/v1alpha/models?key=${process.env.GEMINI_API_KEY}`);
        const dataAlpha = await responseAlpha.json();
        
        console.log("\n=== Model Tersedia di v1alpha ===");
        if (dataAlpha.models) {
            const liteModels = dataAlpha.models.filter(m => m.name.includes('lite') || m.name.includes('3.1'));
            liteModels.forEach(m => console.log(m.name, m.displayName));
        } else {
            console.log(dataAlpha);
        }

    } catch (err) {
        console.error(err);
    }
}

listAllModels();
