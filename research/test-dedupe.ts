
const rawParticipants = [
    { name: "Andrew Lassise", email: "andrew@example.com" },
    { name: "Arlina Allen", email: "" },
    { name: "Bert W", email: "" },
    { name: "Brendan H", email: "" },
    { name: "Carrie Campbell", email: "" },
    { name: "Chris Lipper: Functional Business Coach", email: "" },
    { name: "Diane Prince", email: "" },
    { name: "Emil", email: "" },
    { name: "Emil Bakiyev", email: "emil@example.com" }, // Has email
    { name: "Erik Speakman", email: "" },
    { name: "Jb.", email: "" },
    { name: "Kandace Arena", email: "kandace@example.com" },
    { name: "Keith K", email: "" },
    { name: "Keith K", email: "" }, // Duplicate name test
    { name: "Lori’s iPhone", email: "" },
    { name: "Lori Smith", email: "lori@example.com" }, // Hypothetical match
    { name: "Marshall", email: "" },
    { name: "Peter Moulton", email: "" },
    { name: "Rachel N", email: "" },
    { name: "Sayeed Aljamal", email: "" },
    { name: "Tom Walsh", email: "" },
    { name: "admin", email: "" },
    { name: "tom deem", email: "" },
    { name: "Fireflies.ai Notetaker Diane", email: "" },
    { name: "Andrew's Fathom Notetaker", email: "" },
    { name: "read.ai meeting notes", email: "" },
    { name: "Ken's Notetaker (Otter.ai)", email: "" }
];

function processAttendees(participants) {
    const exclusionKeywords = ['note', 'notetaker', 'fireflies.ai', 'fathom', 'read.ai', 'otter.ai'];
    
    // 1. First Pass: Filter bots and Basic Dedupe
    let cleanList = [];
    const seenEmails = new Set();
    
    for (const p of participants) {
        let name = (p.name || "").trim();
        const email = (p.email || "").toLowerCase();
        const lowerName = name.toLowerCase();

        // Exclusion
        if (exclusionKeywords.some(k => lowerName.includes(k))) continue;

        // Basic Dedupe by Email
        if (email && seenEmails.has(email)) continue;
        if (email) seenEmails.add(email);

        cleanList.push({ name, email, lowerName });
    }

    // 2. Advanced Dedupe
    // Score Quality: 
    // - Has Email: 2
    // - Normal Name: 1
    // - Device Name: 0
    
    cleanList.forEach(p => {
       p.isDevice = /iphone|ipad|android|galaxy/i.test(p.lowerName);
       p.score = (p.email ? 2 : 0) + (p.isDevice ? 0 : 1);
       // Clean name for matching (remove "iPhone", etc)
       p.cleanName = p.lowerName.replace(/['’]s\s*(iphone|ipad|android|galaxy)/i, '').trim();
    });

    // Sort: Score Desc, then Length Desc
    cleanList.sort((a, b) => {
        if (b.score !== a.score) return b.score - a.score;
        return b.name.length - a.name.length;
    });

    const finalAttendees = [];

    for (const p of cleanList) {
        // Check if this person is redundant
        const isDuplicate = finalAttendees.some(existing => {
            // Case A: Exact Email Match (Handled by SeenEmails, but good safety)
            if (p.email && existing.email === p.email) return true;

            // Case B: Name Substring Match
            // If "Emil Bakiyev" (Existing) contains "Emil" (p), and p has no email (or same email)
            // Existing is longer/better score.
            if (existing.lowerName.includes(p.lowerName)) return true; // "Emil Bakiyev" includes "Emil"
            
            // Case C: Device Match
            // If p is "Lori's iPhone" (cleaned="lori"), and existing is "Lori Smith"
            // Does "Lori Smith" include "lori"? Yes.
            if (p.isDevice && existing.lowerName.includes(p.cleanName)) return true;

            // Case D: Common First Name + Last Initial vs Full Name?
            // "Keith K" vs "Keith K" (exact match handled by A?)
            // "Keith K" vs "Keith Knick" -> "Keith Knick" includes "Keith K"? No.
            // We might need "Starts With" logic for "Keith K".
            if (existing.lowerName.startsWith(p.lowerName)) return true;

            return false;
        });

        if (!isDuplicate) {
            finalAttendees.push(p);
        } else {
            console.log(`Duplicate found: "${p.name}" (Score ${p.score}) merged into "${finalAttendees.find(e => e.lowerName.includes(p.cleanName) || e.lowerName.startsWith(p.lowerName))?.name}"`);
        }
    }
    
    return finalAttendees.map(p => p.name).sort();
}

const result = processAttendees(rawParticipants);
console.log("\nFinal List:");
result.forEach(n => console.log(n));
