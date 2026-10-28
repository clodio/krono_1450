const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const assert = require('node:assert/strict');

const root = path.resolve(__dirname, '..');
const manifestPath = path.join(root, 'image-assets.js');
const prefix = 'const IMAGE_ASSETS = ';
const apply = process.argv.includes('--apply');
const compress = process.argv.includes('--compress');
const reportPath = path.join(root, 'image-optimization-report.json');

function listFiles(directory) {
    return fs.readdirSync(directory, { withFileTypes: true }).flatMap(entry => {
        const filename = path.join(directory, entry.name);
        return entry.isDirectory() ? listFiles(filename) : [filename];
    });
}

function relative(filename) {
    return path.relative(root, filename).split(path.sep).join('/');
}

function hash(content) {
    return crypto.createHash('sha256').update(content).digest('hex');
}

function comparePaths(left, right) {
    return left.localeCompare(right, 'en');
}

function usedImages() {
    const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
    const css = fs.readFileSync(path.join(root, 'style.css'), 'utf8');
    const manifest = JSON.parse(fs.readFileSync(path.join(root, 'manifest.json'), 'utf8'));
    const used = new Set(manifest.icons.map(icon => icon.src));
    for (const match of html.matchAll(/\bsrc=["'](?:\.\/)?(images\/[^"']+)["']/g)) used.add(match[1]);
    for (const match of css.matchAll(/url\(["']?(?:\.\/)?(images\/[^)'"\s]+)["']?\)/g)) used.add(match[1]);
    const scenarios = [...html.matchAll(/<option value="([^"]+)"/g)].map(match => match[1]);
    const types = [...html.matchAll(/showScenarioImage\('([^']+)'\)/g)].map(match => match[1]);
    assert.equal(scenarios.length, 15, 'Review scenario discovery before deleting images');
    assert.equal(new Set(types).size, 4, 'Review scenario image buttons before deleting images');
    for (const scenario of scenarios) {
        for (const type of types) used.add(`images/${scenario}/${type}.webp`);
        for (let index = 1; index <= 6; index++) {
            for (const kind of ['character', 'time', 'place', 'place-information']) {
                const name = kind === 'place-information' ? `place${index}-informations` : `${kind}${index}`;
                used.add(`images/${scenario}/${name}.webp`);
            }
        }
    }
    return [...used].sort(comparePaths);
}

function deduplicate(targets, contents) {
    const groups = new Map();
    const replacements = new Map();
    const duplicates = [];
    for (const filename of [...targets].sort(comparePaths)) {
        const content = contents.get(filename);
        const digest = hash(content);
        const canonical = groups.get(digest);
        if (canonical) {
            assert.ok(content.equals(contents.get(canonical)), `Hash collision: ${filename}`);
            replacements.set(filename, canonical);
            duplicates.push({ file: filename, canonical });
        } else {
            groups.set(digest, filename);
            replacements.set(filename, filename);
        }
    }
    return { replacements, duplicates };
}

async function compressImage(filename, original) {
    const sharp = require('sharp');
    const metadata = await sharp(original).metadata();
    assert.ok(!metadata.pages || metadata.pages === 1, `Animated image requires manual review: ${filename}`);
    let encoder = sharp(original);
    if (metadata.format === 'webp') encoder = encoder.webp({ quality: 90, alphaQuality: 100, effort: 6 });
    else if (metadata.format === 'png') encoder = encoder.png({ compressionLevel: 9 });
    else if (metadata.format === 'jpeg') encoder = encoder.jpeg({ quality: 90, mozjpeg: true });
    else return { selected: original, hasAlpha: metadata.hasAlpha };
    const output = await encoder.toBuffer();
    const result = await sharp(output).metadata();
    assert.equal(result.width, metadata.width, `Width changed: ${filename}`);
    assert.equal(result.height, metadata.height, `Height changed: ${filename}`);
    assert.equal(result.hasAlpha, metadata.hasAlpha, `Alpha channel changed: ${filename}`);
    if (metadata.hasAlpha) {
        const beforeAlpha = await sharp(original).extractChannel('alpha').raw().toBuffer();
        const afterAlpha = await sharp(output).extractChannel('alpha').raw().toBuffer();
        assert.ok(beforeAlpha.equals(afterAlpha), `Transparency changed: ${filename}`);
    }
    return { selected: output.length < original.length ? output : original, hasAlpha: metadata.hasAlpha };
}

async function optimize(retained, contents, previous) {
    const optimized = [];
    const outputs = new Map();
    const compressedHashes = {};
    if (apply && compress) {
        await retained.reduce(async (pending, filename) => {
            await pending;
            const original = contents.get(filename);
            if (previous.compressedHashes?.[filename] === hash(original)) {
                compressedHashes[filename] = hash(original);
                return;
            }
            const { selected, hasAlpha } = await compressImage(filename, original);
            compressedHashes[filename] = hash(selected);
            if (selected !== original) {
                outputs.set(filename, selected);
                optimized.push({ file: filename, beforeBytes: original.length, afterBytes: selected.length, alphaVerified: Boolean(hasAlpha) });
            }
        }, Promise.resolve());
    }
    return { optimized, outputs, compressedHashes };
}

async function main() {
    const files = listFiles(path.join(root, 'images')).map(relative).sort(comparePaths);
    const existing = fs.existsSync(manifestPath)
        ? JSON.parse(fs.readFileSync(manifestPath, 'utf8').trim().slice(prefix.length, -1))
        : {
            'images/le_sceptre_dor_5/place6-informations.webp': 'images/le_sceptre_dor_5/place6-informations(63).webp',
            'images/le_sceptre_dor_5/setup.webp': 'images/le_sceptre_dor_5/setup.jpg'
        };
    const previous = fs.existsSync(reportPath) ? JSON.parse(fs.readFileSync(reportPath, 'utf8')) : {};
    const contents = new Map(files.map(filename => [filename, fs.readFileSync(path.join(root, filename))]));
    const used = usedImages();
    const targets = new Set(used.map(logical => existing[logical] || logical));
    for (const target of targets) assert.ok(contents.has(target), `Missing image: ${target}`);
    const { replacements, duplicates } = deduplicate(targets, contents);
    const assets = Object.fromEntries(used.map(logical => [logical, replacements.get(existing[logical] || logical)]));
    const unused = files.filter(filename => !targets.has(filename));
    const retained = [...new Set(Object.values(assets))];
    const variants = new Map();
    for (const filename of files) {
        const name = path.basename(filename);
        if (!variants.has(name)) variants.set(name, new Set());
        variants.get(name).add(hash(contents.get(filename)));
    }
    const sameNameDifferentContents = Object.fromEntries([...variants].filter(([, hashes]) => hashes.size > 1).map(([name, hashes]) => [name, hashes.size]));
    const { optimized, outputs, compressedHashes } = await optimize(retained, contents, previous);
    const beforeBytes = [...contents.values()].reduce((total, content) => total + content.length, 0);
    const afterBytes = retained.reduce((total, filename) => total + (outputs.get(filename) || contents.get(filename)).length, 0);
    const report = {
        mode: apply ? 'apply' : 'check',
        quality: 90,
        beforeFiles: files.length,
        afterFiles: retained.length,
        logicalImages: used.length,
        beforeBytes,
        afterBytes,
        savedBytes: beforeBytes - afterBytes,
        unused,
        duplicates,
        sameNameDifferentContents,
        optimized,
        compressedHashes: { ...previous.compressedHashes, ...compressedHashes }
    };
    if (apply) {
        for (const [filename, content] of outputs) fs.writeFileSync(path.join(root, filename), content);
        fs.writeFileSync(manifestPath, `${prefix}${JSON.stringify(assets, null, 2)};\n`);
        for (const filename of [...unused, ...duplicates.map(duplicate => duplicate.file)]) fs.unlinkSync(path.join(root, filename));
        fs.writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`);
    }
    console.log(JSON.stringify({ ...report, unused: unused.length, duplicates: duplicates.length, optimized: optimized.length, compressedHashes: undefined }, null, 2));
    if (!apply && unused.length) console.log('Unused images:\n' + unused.join('\n'));
}

main().catch(error => {
    console.error(error);
    process.exitCode = 1;
});