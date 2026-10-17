import { useEffect, useState } from "react";
import { useTranslate } from "../localization";
export function SuccessFeedback() {
  const tr = useTranslate();
  const [notice,setNotice] = useState<{message:string;revision:number} | null>(null);
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    const show = (event: Event) => {
      const message = (event as CustomEvent).detail?.message;
      if(typeof message !== "string") return;
      clearTimeout(timer); setNotice(n => ({message,revision:(n?.revision ?? 0)+1}));
      timer = setTimeout(() => setNotice(null),2600);
    };
    window.addEventListener("dakshsetu:success",show);
    const synced = () => show(new window.CustomEvent("dakshsetu:success",{detail:{message:"Done"}}));
    window.addEventListener("dakshsetu:sync-complete",synced);
    return () => { clearTimeout(timer); window.removeEventListener("dakshsetu:success",show); window.removeEventListener("dakshsetu:sync-complete",synced); };
  },[]);
  return <div className="success-feedback-region" role="status" aria-live="polite" aria-atomic="true">
    {notice && <div key={notice.revision} className="success-feedback"><svg className="success-feedback-check" viewBox="0 0 32 32" aria-hidden="true"><circle cx="16" cy="16" r="14" /><path d="m9 16 5 5 9-10" /></svg><span>{tr(notice.message)}</span></div>}
  </div>;
}
