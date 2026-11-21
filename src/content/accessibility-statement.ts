import type { Locale } from "@/server/db/schema";

// PRD §20: claim only what is implemented and tested; update on every accessibility change.
export const STATEMENT_UPDATED = "2026-11-13";

type Statement = {
  title: string;
  commitmentH: string; commitment: string;
  standardH: string; standard: string;
  featuresH: string; features: string[];
  testingH: string; testing: string[];
  limitationsH: string; limitations: string[];
  contactH: string; contact: string; contactMissing: string;
  legal: string;
  updated: string;
};

export const statement: Record<Locale, Statement> = {
  en: {
    title: "Accessibility statement",
    commitmentH: "Our commitment",
    commitment: "Pet Care Hub is committed to providing an accessible and usable digital experience for all users, including people with disabilities.",
    standardH: "Accessibility standard",
    standard: "The application is designed and developed with the goal of conforming to WCAG 2.2 Level AA.",
    featuresH: "Accessibility features",
    features: [
      "Full keyboard navigation, a \"Skip to main content\" link and clearly visible keyboard focus.",
      "Semantic page structure with headings, landmarks, labelled forms and data tables with column headers.",
      "Form fields with visible labels, required-field indicators and error messages that explain how to fix the problem. Focus moves to the first error.",
      "Confirmation dialogs before destructive actions, with keyboard focus kept inside the dialog.",
      "An accessibility toolbar: text size (up to 200%), high-contrast mode, underlined links, stronger focus highlight and reduced animations. Settings are saved per user.",
      "Respect for the operating system's reduced-motion preference.",
      "Full Hebrew (right-to-left) and English (left-to-right) interfaces. Email addresses and phone numbers keep their reading direction.",
      "Responsive layout for mobile, tablet and desktop, with touch targets of at least 44 pixels.",
      "The calendar is presented as a day-by-day list with headings, which works with screen readers and on small screens.",
      "Statuses (dose given, task overdue, event cancelled) are shown with text and an icon, not colour alone. Results of quick actions are announced to screen readers.",
    ],
    testingH: "How we tested",
    testing: [
      "Automated accessibility checks (axe-core, WCAG 2.2 A/AA rules) on the main pages in Hebrew and English.",
      "Automated keyboard-only tests of registration, login, creating a pet and the accessibility toolbar.",
      "Automated accessibility checks of the medications, calendar and task pages in Hebrew and English.",
    ],
    limitationsH: "Known limitations",
    limitations: [
      "Manual testing with screen readers (NVDA, VoiceOver, TalkBack) has not been completed yet.",
      "Manual testing of zoom/reflow and mobile accessibility on real devices has not been completed yet.",
      "Animal icons are emoji and may look different across devices. They are decorative and the animal type is always written in text.",
      "Google and Apple sign-in are not available yet.",
    ],
    contactH: "Feedback and accessibility support",
    contact: "If you run into an accessibility problem or need help, please contact us at:",
    contactMissing: "An accessibility contact address will be published before public launch.",
    legal: "This statement has not yet been reviewed by an accessibility professional, and the application does not claim legal compliance or certification.",
    updated: "Last updated",
  },
  he: {
    title: "הצהרת נגישות",
    commitmentH: "המחויבות שלנו",
    commitment: "Pet Care Hub מחויבת לספק חוויה דיגיטלית נגישה ושמישה לכל המשתמשים, כולל אנשים עם מוגבלויות.",
    standardH: "תקן הנגישות",
    standard: "האפליקציה מתוכננת ומפותחת במטרה לעמוד בהנחיות WCAG 2.2 ברמה AA.",
    featuresH: "התאמות הנגישות באתר",
    features: [
      "ניווט מלא באמצעות המקלדת, קישור \"דילוג לתוכן הראשי\" וסימון מיקוד בולט.",
      "מבנה עמוד סמנטי הכולל כותרות, אזורי ניווט, טפסים עם תוויות וטבלאות נתונים עם כותרות עמודה.",
      "שדות טופס עם תוויות גלויות, סימון שדות חובה והודעות שגיאה שמסבירות איך לתקן. המיקוד עובר לשגיאה הראשונה.",
      "חלונות אישור לפני פעולות בלתי הפיכות, כשמיקוד המקלדת נשמר בתוך החלון.",
      "סרגל נגישות: הגדלת טקסט (עד 200%), מצב ניגודיות גבוהה, קו תחתון לקישורים, הדגשת מיקוד והפחתת אנימציות. ההגדרות נשמרות לכל משתמש.",
      "כיבוד העדפת \"הפחתת תנועה\" של מערכת ההפעלה.",
      "ממשק מלא בעברית (מימין לשמאל) ובאנגלית (משמאל לימין). כתובות דוא\"ל ומספרי טלפון נשמרים בכיוון הקריאה הנכון.",
      "תצוגה מותאמת לנייד, לטאבלט ולמחשב, עם אזורי לחיצה בגודל 44 פיקסלים לפחות.",
      "לוח השנה מוצג כרשימה לפי ימים עם כותרות, המתאימה לקוראי מסך ולמסכים קטנים.",
      "סטטוסים (מנה ניתנה, משימה באיחור, אירוע בוטל) מוצגים בטקסט ובסמל, לא בצבע בלבד. תוצאות של פעולות מהירות מוקראות לקוראי מסך.",
    ],
    testingH: "כיצד בדקנו",
    testing: [
      "בדיקות נגישות אוטומטיות (axe-core, כללי WCAG 2.2 A/AA) בעמודים המרכזיים, בעברית ובאנגלית.",
      "בדיקות אוטומטיות של שימוש במקלדת בלבד: הרשמה, התחברות, יצירת חיית מחמד וסרגל הנגישות.",
      "בדיקות נגישות אוטומטיות של עמודי התרופות, לוח השנה והמשימות, בעברית ובאנגלית.",
    ],
    limitationsH: "מגבלות ידועות",
    limitations: [
      "טרם הושלמו בדיקות ידניות עם קוראי מסך (NVDA,‏ VoiceOver,‏ TalkBack).",
      "טרם הושלמו בדיקות ידניות של הגדלה וזרימה מחדש ושל נגישות במכשירים ניידים אמיתיים.",
      "אייקוני בעלי החיים הם אמוג'י ועשויים להיראות שונה בין מכשירים. הם דקורטיביים בלבד, וסוג בעל החיים תמיד מופיע גם בטקסט.",
      "התחברות עם Google ו-Apple עדיין אינה זמינה.",
    ],
    contactH: "משוב ותמיכה בנגישות",
    contact: "נתקלתם בבעיית נגישות או זקוקים לעזרה? פנו אלינו:",
    contactMissing: "כתובת ליצירת קשר בנושא נגישות תפורסם לפני ההשקה הציבורית.",
    legal: "הצהרה זו טרם נבדקה על ידי מורשה/ית נגישות, והאפליקציה אינה מצהירה על עמידה בדרישות החוק או על הסמכה.",
    updated: "עודכן לאחרונה",
  },
};
