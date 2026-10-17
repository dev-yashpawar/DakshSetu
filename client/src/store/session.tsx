import {
  createContext,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";
import { api, errorMessage } from "../services/api";
import type { Language, PublicUser } from "../../../shared/types";
import { copy } from "../i18n";
import {
  rememberUser,
  forgetUser,
  rememberedUser,
  offlineSessionValid,
} from "../services/offline";
type Session = {
  user: PublicUser | null;
  ready: boolean;
  sessionError: string;
  language: Language;
  supportedLanguages: Language[];
  demoAccountsEnabled: boolean;
  setLanguage: (lang: Language) => void;
  authenticate: (user: PublicUser, token: string) => void;
  logout: () => void;
  retry: () => void;
};
const Context = createContext<Session>(null!);
export function SessionProvider({ children }: { children: ReactNode }) {
  const [supportedLanguages, setSupportedLanguages] = useState<Language[]>([
      "en",
      "hi",
      "mr",
    ]),
    [demoAccountsEnabled, setDemoAccountsEnabled] = useState(true);
  const [user, setUser] = useState<PublicUser | null>(null),
    [ready, setReady] = useState(false),
    [sessionError, setSessionError] = useState(""),
    [revision, setRevision] = useState(0);
  const [language, setLang] = useState<Language>(() => {
    const l = localStorage.getItem("dakshsetu-language");
    return l === "hi" || l === "mr" ? l : "en";
  });
  const setLanguage = (lang: Language) => {
    if (!supportedLanguages.includes(lang)) return;
    setLang(lang);
    localStorage.setItem("dakshsetu-language", lang);
  };
  useEffect(() => {
    let live = true;
    const load = () => {
      void api
        .get("/settings/public")
        .then((r) => {
          if (!live) return;
          const supported = (r.data.languages ?? []).filter((l: string) =>
            ["en", "hi", "mr"].includes(l),
          ) as Language[];
          if (supported.length) {
            setSupportedLanguages(supported);
            setLang((current) =>
              supported.includes(current) ? current : supported[0],
            );
          }
          setDemoAccountsEnabled(r.data.demoEnabled !== false);
        })
        .catch(() => {});
    };
    load();
    window.addEventListener("online", load);
    window.addEventListener("dakshsetu:settings-changed", load);
    return () => {
      live = false;
      window.removeEventListener("online", load);
      window.removeEventListener("dakshsetu:settings-changed", load);
    };
  }, []);
  const authenticate = (u: PublicUser, token: string) => {
    sessionStorage.setItem("dakshsetu-token", token);
    rememberUser(u);
    setUser(u);
    setSessionError("");
  };
  const logout = () => {
    sessionStorage.removeItem("dakshsetu-token");
    forgetUser();
    setUser(null);
    setSessionError("");
  };
  useEffect(() => {
    document.documentElement.lang = language;
  }, [language]);
  useEffect(() => {
    let cancelled = false;
    setReady(false);
    setSessionError("");
    if (!sessionStorage.getItem("dakshsetu-token")) {
      setReady(true);
      return;
    }
    api
      .get<PublicUser>("/auth/me")
      .then(({ data }) => {
        if (!cancelled) {
          setUser(data);
          rememberUser(data);
        }
      })
      .catch((e) => {
        if (cancelled) return;
        if (e.response?.status === 401) {
          sessionStorage.removeItem("dakshsetu-token");
          forgetUser();
          setUser(null);
        } else if (!e.response && rememberedUser() && offlineSessionValid())
          setUser(rememberedUser());
        else setSessionError(errorMessage(e));
      })
      .finally(() => {
        if (!cancelled) setReady(true);
      });
    return () => {
      cancelled = true;
    };
  }, [revision]);
  return (
    <Context.Provider
      value={{
        user,
        ready,
        sessionError,
        language,
        supportedLanguages,
        demoAccountsEnabled,
        setLanguage,
        authenticate,
        logout,
        retry: () => setRevision((r) => r + 1),
      }}
    >
      {children}
    </Context.Provider>
  );
}
export const useSession = () => useContext(Context);
export function useCopy() {
  const { language } = useSession();
  return copy[language];
}
