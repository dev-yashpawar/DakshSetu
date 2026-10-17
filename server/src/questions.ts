import type { Question } from "../../shared/types.js";
// Server-only answer bank. Never imported by the client.
export const questions: Question[] = [
  {
    id: "safety",
    question: "Before repairing a circuit, what should you do first?",
    options: [
      "Disconnect and verify the power is off",
      "Turn on the MCB",
      "Replace the wire",
      "Test the fan",
    ],
    correctAnswer: 0,
    competency: "Safety",
    weight: 20,
  },
  {
    id: "tools",
    question: "Which tool checks voltage in an electrical circuit?",
    options: ["Measuring tape", "Multimeter", "Hacksaw", "Hammer"],
    correctAnswer: 1,
    competency: "Tools",
    weight: 20,
  },
  {
    id: "wiring",
    question: "What is the purpose of an earth wire?",
    options: [
      "Increase voltage",
      "Replace the neutral wire",
      "Provide a safe path for fault current",
      "Make a fan run faster",
    ],
    correctAnswer: 2,
    competency: "Wiring",
    weight: 20,
  },
  {
    id: "testing",
    question: "When should you test the completed installation?",
    options: [
      "Only when it stops working",
      "Only after one year",
      "Never",
      "Before putting it into service",
    ],
    correctAnswer: 3,
    competency: "Testing",
    weight: 20,
  },
  {
    id: "fault",
    question: "An MCB trips repeatedly. What should you do?",
    options: [
      "Investigate the circuit safely for a fault or overload",
      "Hold the MCB on",
      "Replace it with any larger MCB",
      "Ignore it",
    ],
    correctAnswer: 0,
    competency: "Fault Diagnosis",
    weight: 20,
  },
];
