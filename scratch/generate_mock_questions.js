// Bismillah.
const { Database } = require("bun:sqlite");
const db = new Database("/home/abuhafi/Project/TesDeen/backend/data.db");

const models = ["qwen2.5:7b", "gemma2:9b", "mistral-nemo:latest", "phi3.5:latest", "aya:latest"];
const articles = [
  { id: 1, title: "Aqidah Ahlissunnah wal Jama’ah" },
  { id: 2, title: "Al-Jami’ Li ‘Ibadatillah Wahdah" },
  { id: 3, title: "Al-Ushul Ats-Tsalatsah (Tiga Pondasi)" },
  { id: 4, title: "Fadhlul Islam (Keutamaan Agama Islam)" },
  { id: 5, title: "Lum’atul I’tiqad" }
];

const mockQuestions = [
  {
    question_text: "Apa arti dari Aqidah Ahlissunnah wal Jama'ah?",
    option_a: "Keyakinan yang berpegang teguh pada sunnah Nabi dan kesepakatan sahabat",
    option_b: "Keyakinan yang berdasarkan akal semata",
    option_c: "Keyakinan yang mengikuti tradisi nenek moyang tanpa dalil",
    option_d: "Keyakinan yang memisahkan diri dari jamaah kaum muslimin",
    correct_option: "A",
    explanation: "Aqidah Ahlissunnah wal Jama'ah adalah aqidah yang bersumber dari Al-Qur'an dan Sunnah sesuai pemahaman para sahabat Nabi shallallahu 'alaihi wa sallam.",
    reference_snippet: "Aqidah Ahlissunnah wal Jama'ah adalah keyakinan yang berpegang teguh pada sunnah Nabi and para sahabat."
  },
  {
    question_text: "Siapakah generasi terbaik umat Islam menurut hadits Nabi?",
    option_a: "Generasi sahabat, tabiin, dan tabi'ut tabiin",
    option_b: "Generasi abad pertengahan",
    option_c: "Generasi modern saat ini",
    option_d: "Generasi akhir zaman",
    correct_option: "A",
    explanation: "Generasi terbaik adalah generasi sahabat, kemudian orang-orang setelah mereka (tabiin), lalu setelah mereka (tabi'ut tabiin).",
    reference_snippet: "Sebaik-baik manusia adalah generasiku, kemudian orang-orang setelah mereka, lalu orang-orang setelah mereka."
  },
  {
    question_text: "Apakah syarat diterimanya suatu ibadah di sisi Allah?",
    option_a: "Ikhlas karena Allah dan ittiba' (mengikuti ajaran Rasulullah)",
    option_b: "Niat yang baik dan dilakukan secara meriah",
    option_c: "Jumlah jamaah yang banyak dan megah",
    option_d: "Hanya butuh keikhlasan tanpa peduli tata cara",
    correct_option: "A",
    explanation: "Syarat mutlak diterimanya ibadah adalah ikhlas karena Allah semata (tauhid) dan mengikuti contoh Nabi shallallahu 'alaihi wa sallam (ittiba').",
    reference_snippet: "Ibadah tidak akan diterima melainkan jika memenuhi dua syarat: Ikhlas dan Ittiba'."
  },
  {
    question_text: "Kitab Al-Ushul Ats-Tsalatsah membahas tentang apa?",
    option_a: "Tiga pertanyaan kubur: Siapa Rabbmu, apa agamamu, dan siapa nabimu",
    option_b: "Tiga hukum dagang dalam Islam",
    option_c: "Tiga rukun shalat fardhu",
    option_d: "Tiga syarat zakat mal",
    correct_option: "A",
    explanation: "Kitab Al-Ushul Ats-Tsalatsah karya Syaikh Muhammad bin Abdul Wahhab membahas tiga landasan utama yaitu mengenal Allah, mengenal agama Islam, dan mengenal Nabi Muhammad.",
    reference_snippet: "Tiga landasan utama yang wajib diketahui setiap muslim adalah mengenal Rabb, agama, dan Nabi-Nya."
  },
  {
    question_text: "Apa keutamaan terbesar dari mempelajari Tauhid?",
    option_a: "Mendapat keamanan di dunia dan akhirat serta petunjuk",
    option_b: "Menjadi terkenal di kalangan manusia",
    option_c: "Mendapatkan harta dunia yang melimpah",
    option_d: "Terbebas dari seluruh kewajiban ibadah",
    correct_option: "A",
    explanation: "Tauhid memberikan jaminan keamanan sejati di dunia dan akhirat bagi yang mengamalkannya dengan benar.",
    reference_snippet: "Orang-orang yang beriman dan tidak mencampuradukkan iman mereka dengan syirik, mereka itulah yang mendapat keamanan dan petunjuk."
  },
  {
    question_text: "Siapakah penulis kitab Aqidah Lum'atul I'tiqad?",
    option_a: "Imam Ibnu Qudamah Al-Maqdisi rahimahullah",
    option_b: "Imam Ahmad bin Hanbal",
    option_c: "Imam Asy-Syafi'i",
    option_d: "Imam Abu Hanifah",
    correct_option: "A",
    explanation: "Kitab Lum'atul I'tiqad Al-Hadi ila Sabilil Rasyad ditulis oleh ulama besar madzhab Hanbali, Imam Ibnu Qudamah Al-Maqdisi.",
    reference_snippet: "Kitab Lum'atul I'tiqad ditulis oleh Al-Imam Ibnu Qudamah Al-Maqdisi rahimahullah."
  }
];

try {
  console.log("Bismillah. Starting generation of 30 mock questions...");
  let count = 0;
  
  // We want to insert 30 questions in total: 6 questions for each of the 5 models
  for (let i = 0; i < 5; i++) {
    const model = models[i];
    for (let j = 0; j < 6; j++) {
      const q = mockQuestions[j];
      const article = articles[(i + j) % articles.length];
      const fullText = "[" + model + "] - " + q.question_text;
      
      db.query(`
        INSERT INTO questions (
          article_id, 
          question_text, 
          option_a, 
          option_b, 
          option_c, 
          option_d, 
          correct_option, 
          explanation, 
          reference_snippet, 
          created_by_model, 
          created_on_device, 
          checked_status
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        article.id,
        fullText,
        q.option_a,
        q.option_b,
        q.option_c,
        q.option_d,
        q.correct_option,
        q.explanation,
        q.reference_snippet,
        model,
        "Server-Dev-01",
        "buatan AI"
      );
      count++;
    }
  }
  
  console.log("Alhamdulillah! Successfully inserted " + count + " mock benchmark questions into database!");
  
  const total = db.query("SELECT COUNT(*) as count FROM questions").get().count;
  console.log("Total questions in local database now:", total);
} catch (err) {
  console.error("Error inserting mock questions:", err);
} finally {
  db.close();
}
