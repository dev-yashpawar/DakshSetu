import { registerMessages } from "../localization";
import { practicalMessages } from "./practical";
// These translations travel with the assessment routes, keeping the landing bundle small.
registerMessages(practicalMessages);
