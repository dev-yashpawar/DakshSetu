import "dotenv/config";
import { randomUUID } from "node:crypto";
import { syntheticVideo } from "../test/helpers/video.js";
import { representativeFrames } from "../src/video.js";
import { CloudinaryStorage, observeEvidence } from "../src/evidence.js";
import { qualification } from "../../shared/data.js";
import { practicalTask } from "../../shared/assessment.js";
import { taskInstructions } from "../../shared/practical.js";
for (const name of ["GEMINI_API_KEY","CLOUDINARY_CLOUD_NAME","CLOUDINARY_API_KEY","CLOUDINARY_API_SECRET"]) if(!process.env[name]) throw Error("Missing setting: " + name);
const storage = new CloudinaryStorage({cloud_name:process.env.CLOUDINARY_CLOUD_NAME,api_key:process.env.CLOUDINARY_API_KEY,api_secret:process.env.CLOUDINARY_API_SECRET});
const clip = await syntheticVideo(); let asset: string | undefined;
try {
  const uploaded = await storage.uploadVideo!(clip.bytes,"dakshsetu/synthetic-practical-test/" + randomUUID()); asset = uploaded.publicId;
  const sampled = await representativeFrames(clip.bytes,"video/mp4",true);
  const review = await observeEvidence(sampled.frames,randomUUID(),{apiKey:process.env.GEMINI_API_KEY,model:process.env.GEMINI_MODEL || "gemini-2.5-flash"},2,"video",undefined,{frameTimes:sampled.times,duration:sampled.duration,task:{title:practicalTask,instructions:taskInstructions},qualification,language:"en"});
  console.log(JSON.stringify({result:"PASS",storage:"Authenticated Cloudinary video upload",provider:"Live Gemini",fixture:"Synthetic test-pattern video; not real assessor results",frames:sampled.frames.length,observations:review.observations.length,criterionSuggestions:review.suggestedScores?.length,timestampsValidated:true}));
} catch(error) {
  console.error(JSON.stringify({result:"UNAVAILABLE",message:error instanceof Error ? error.message : "Live provider unavailable",fallback:"Manual assessor review remains available"})); process.exitCode=1;
} finally { if(asset) await storage.removeVideo!(asset); await clip.cleanup(); }
