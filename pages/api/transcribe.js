import formidable from "formidable";
import fs from "fs";
import OpenAI from "openai";

export const config = { api: { bodyParser: false } };

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  const form = formidable({ maxFileSize: 25 * 1024 * 1024 });

  form.parse(req, async (err, fields, files) => {
    if (err) return res.status(400).json({ error: "File upload failed" });

    const file = files.audio?.[0];
    if (!file) return res.status(400).json({ error: "No audio file received" });

    try {
      const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

      const transcription = await openai.audio.transcriptions.create({
        file: fs.createReadStream(file.filepath),
        model: "whisper-1",
        language: "en",
        prompt: "Radiology dictation. Medical terminology: ACL PCL meniscus chondral effusion synovitis supraspinatus infraspinatus subscapularis labrum acetabular lumbar cervical foraminal stenosis ligamentum tendons bursa articular cartilage grade 1 grade 2 grade 3 grade 4 unremarkable intact attenuated retracted Baker cyst TFCC scapholunate glenohumeral acromioclavicular conus impingement",
      });

      fs.unlinkSync(file.filepath);
      return res.status(200).json({ text: transcription.text });
    } catch (error) {
      console.error("Whisper error:", error);
      return res.status(500).json({ error: error.message || "Transcription failed" });
    }
  });
}
