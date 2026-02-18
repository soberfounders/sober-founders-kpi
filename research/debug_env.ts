
const bytes = await Deno.readFile('.env');
const text = new TextDecoder().decode(bytes);
console.log("File length:", text.length);
console.log("First 20 chars:", text.slice(0, 20).replace(/\n/g, '\\n').replace(/\r/g, '\\r'));

const lines = text.split(/\r?\n/);
console.log("Line count:", lines.length);

for (const line of lines) {
    const match = line.match(/^([^=]+)=(.*)$/);
    if (match) {
        console.log(`Found key: "${match[1]}"`);
    } else if (line.trim()) {
        console.log(`Skipping line: "${line.slice(0, 10)}..."`);
    }
}
