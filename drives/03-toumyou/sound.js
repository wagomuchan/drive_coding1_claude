// ブチッの音 ファイルは使わず Web Audio で作る

let ctx = null;
let noise = null;
let muted = false;

export function setMuted(b)
{
    muted = b;
}

function make_noise(c)
{
    const len = Math.floor(c.sampleRate * 0.12);
    const buf = c.createBuffer(1, len, c.sampleRate);
    const d = buf.getChannelData(0);
    for(let i=0;i<len;i++){
        d[i] = Math.random() * 2 - 1;
    }
    return buf;
}

// iPhone は最初のタッチまで鳴らない→タッチのたびに起こす
export function unlockAudio()
{
    if(!ctx){
        const AC = window.AudioContext || window.webkitAudioContext;
        if(!AC){
            return;
        }
        try {
            ctx = new AC();
        } catch {
            ctx = null;
            return;
        }
        noise = make_noise(ctx);
    }
    if(ctx.state != 'running'){
        const p = ctx.resume();
        if(p && p.catch){
            p.catch(() => {});
        }
        // 無音を1回 古いiOS用
        const src = ctx.createBufferSource();
        src.buffer = ctx.createBuffer(1, 1, 22050);
        src.connect(ctx.destination);
        src.start(0);
    }
}

function env(gain, t, peak, attack, release)
{
    gain.gain.setValueAtTime(0.0001, t);
    gain.gain.exponentialRampToValueAtTime(peak, t + attack);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + attack + release);
}

// combo:何本目か だんだん少し高く
export function playBuchi(combo, delay)
{
    if(muted || !ctx || ctx.state != 'running'){
        return;
    }
    const t = ctx.currentTime + (delay || 0);
    const up = 1 + Math.min(combo, 16) * 0.03 + (Math.random() - 0.5) * 0.1;

    const out = ctx.createGain();
    out.gain.value = 0.5;
    out.connect(ctx.destination);

    // ブ
    const osc = ctx.createOscillator();
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(380 * up, t);
    osc.frequency.exponentialRampToValueAtTime(95 * up, t + 0.05);
    const og = ctx.createGain();
    env(og, t, 0.55, 0.003, 0.06);
    osc.connect(og);
    og.connect(out);
    osc.start(t);
    osc.stop(t + 0.08);

    // チッ 繊維が切れる
    const n1 = ctx.createBufferSource();
    n1.buffer = noise;
    const bp = ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.value = 2400 * up;
    bp.Q.value = 1.3;
    const g1 = ctx.createGain();
    env(g1, t, 0.9, 0.002, 0.035);
    n1.connect(bp);
    bp.connect(g1);
    g1.connect(out);
    n1.start(t, Math.random() * 0.06, 0.045);

    // ッ もう1回小さく
    const t2 = t + 0.016 + Math.random() * 0.008;
    const n2 = ctx.createBufferSource();
    n2.buffer = noise;
    const hp = ctx.createBiquadFilter();
    hp.type = 'highpass';
    hp.frequency.value = 4200 * up;
    const g2 = ctx.createGain();
    env(g2, t2, 0.45, 0.001, 0.018);
    n2.connect(hp);
    hp.connect(g2);
    g2.connect(out);
    n2.start(t2, Math.random() * 0.06, 0.025);
}
