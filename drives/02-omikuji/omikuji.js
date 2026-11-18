// おみくじの中身（運勢・最初のパーツ）と、引くときの計算
// 保存・通信はしない（storage.js と weather.js のしごと）

export const PART_MAX = 15;

// 運勢 いい順 19個 固定
// kichi=吉寄り naka=中立 kyou=凶寄り
export const FORTUNES = [
    { name: '超絶アルティメット大吉', group: 'kichi' },
    { name: 'ウルトラ大吉', group: 'kichi' },
    { name: '相当大吉', group: 'kichi' },
    { name: '大吉', group: 'kichi' },
    { name: 'まあ大吉でいいんじゃない？', group: 'kichi' },
    { name: '中吉', group: 'kichi' },
    { name: 'ギリギリ中吉に届かなかった', group: 'kichi' },
    { name: '小吉', group: 'kichi' },
    { name: 'ミニ吉', group: 'kichi' },
    { name: '吉', group: 'kichi' },
    { name: 'ちっちゃな吉', group: 'kichi' },
    { name: '末吉', group: 'kichi' },
    { name: '吉でも凶でもない', group: 'naka' },
    { name: 'どっちかっていうと凶', group: 'kyou' },
    { name: '凶かも', group: 'kyou' },
    { name: '凶', group: 'kyou' },
    { name: '結構凶', group: 'kyou' },
    { name: '大凶', group: 'kyou' },
    { name: 'かわいそうなくらいの大凶', group: 'kyou' },
];

// 文の形：〈いつ〉に、〈どこ〉で、〈何をする〉と、〈どうなる〉。
export const PART_KINDS = [
    { key: 'itsu', label: 'いつ', after: 'に、', placeholder: 'ギリギリおならを我慢できた後' },
    { key: 'doko', label: 'どこ', after: 'で、', placeholder: 'エレベーターの中' },
    { key: 'nani', label: '何をする', after: 'と、', placeholder: '何もなかったふりをする' },
    { key: 'dounaru', label: 'どうなる', after: '。', placeholder: '誰にもバレずに済む' },
];

// 最初から入れておくパーツ 各30個
// 日常のあるある ファンタジーなし
export const DEFAULT_PARTS = {
    itsu: [
        'ギリギリおならを我慢できた後',
        '知らない人に手を振り返した後',
        '改札でピンポンと止められた後',
        '階段がもう一段あると思った後',
        '先生を「お母さん」と呼んだ後',
        '押すドアを引いた後',
        '自動ドアが開かなかった後',
        '人違いで振り向いた後',
        '手に持ったスマホを探した後',
        '頭の上のメガネを探した後',
        '送信してから誤字に気づいた後',
        '開と閉を押し間違えた後',
        '寝ぐせに夕方気づいた後',
        'レジで小銭がピッタリ出た後',
        '信号に一度も止まらなかった後',
        '自販機で当たりが出た後',
        '店員さんにタメ口で返した後',
        '電車で寝過ごしかけた後',
        'くしゃみが出そうで出なかった後',
        '好きな曲がお店で流れた後',
        '鍵を閉めたか不安になった後',
        '誰もいない所で転びかけた後',
        '声が裏返った後',
        '「すみません」が小さすぎた後',
        '目覚ましより先に起きた後',
        'ポケットから千円が出てきた後',
        'お釣りを取り忘れかけた後',
        '思い出し笑いを見られた後',
        '大事なところで噛んだ後',
        '「お疲れさまです」がかぶった後',
    ],
    doko: [
        'エレベーターの中',
        'コンビニのレジ前',
        '洗面所の鏡の前',
        '信号待ちの横断歩道',
        '満員電車のつり革の下',
        '駅の改札の前',
        'ベッドの上',
        '会社のトイレの個室',
        'スーパーの試食コーナー',
        '誰もいない会議室',
        '歯医者の待合室',
        'お風呂の湯船の中',
        '朝の駅のホーム',
        'ファミレスのドリンクバー',
        '家の玄関',
        'エスカレーターの上',
        '静かな図書館',
        '職場の給湯室',
        '美容院の椅子の上',
        '布団の中',
        'バス停のベンチ',
        '自販機の前',
        '本屋のマンガ売り場',
        '公園のベンチ',
        '冷蔵庫の前',
        '夜中の台所',
        'コインランドリー',
        'ベランダ',
        '回転寿司のカウンター',
        '駐車場の車の中',
    ],
    nani: [
        '何もなかったふりをする',
        '小さくガッツポーズする',
        '心の中で拍手する',
        '鼻歌をやめる',
        '咳ばらいでごまかす',
        'スマホを見るふりをする',
        '深呼吸を一回する',
        '自分にお疲れさまと言う',
        '背筋をのばす',
        '何気なく髪を直す',
        '一人で小さくうなずく',
        '急いでいるふりをする',
        'にっこり会釈する',
        '水を一杯飲む',
        '靴ひもを結び直す',
        'ちょっとだけ伸びをする',
        'こっそりスキップする',
        '「ありがとう」と言う',
        '声を出さずに笑う',
        '肩の力を抜く',
        '「よし」とつぶやく',
        '目を閉じて三秒数える',
        '知らん顔で歩き出す',
        '照れ笑いをする',
        '今日の自分をほめる',
        'メガネをくいっと上げる',
        '遠くを見つめる',
        'わざとゆっくり歩く',
        '小声で「セーフ」と言う',
        '堂々と胸を張る',
    ],
    dounaru: [
        '誰にもバレずに済む',
        'ちょっとだけ報われる',
        '自分を少し好きになる',
        '今日一日なんとかなる',
        '次の信号が青になる',
        '気持ちが少し軽くなる',
        '誰かがクスッと笑ってくれる',
        '夜ごはんがおいしくなる',
        'いいことが一つ起きる',
        '明日の自分が助かる',
        '今夜はぐっすり眠れる',
        '忘れていたことを思い出す',
        '恥ずかしさが半分になる',
        '意外と誰も見ていない',
        '小銭がちょうど出る',
        '好きな曲が頭に流れる',
        '肩こりが少しマシになる',
        '次はうまくいく',
        '待ち時間が短くなる',
        '帰り道が楽しくなる',
        '忘れ物に気づける',
        '笑い話が一つ増える',
        '今日のハイライトになる',
        'なぜか自信がわく',
        '運気がちょっと上がる',
        '誰かに優しくできる',
        'ポイントが少し貯まる',
        '週末が少し近づく',
        'ちょっと大人になれた気がする',
        '明日も同じことをしたくなる',
    ],
};

// グループごとの合計 null=基本の重みのまま
const GROUP_SHARE = {
    hare: null,
    kumori: { kichi: 0.475, naka: 0.05, kyou: 0.475 },
    ame: { kichi: 0.25, naka: 0.05, kyou: 0.70 },
};

function base_weight(i)
{
    if(i==0 || i==FORTUNES.length-1){
        return 0.5;//両端レア
    }
    return 1;
}

// 19個それぞれの確率（合計1）
// weatherGroup: 'hare' | 'kumori' | 'ame' | null(わからない)
export function calcProbs(weatherGroup)
{
    const n = FORTUNES.length;
    let probs = [];

    if(weatherGroup == null || !(weatherGroup in GROUP_SHARE)){
        for(let i=0;i<n;i++){
            probs.push(1/n);
        }
        return probs;//全部同じ
    }

    const share = GROUP_SHARE[weatherGroup];
    if(share == null){
        let total=0;
        for(let i=0;i<n;i++){
            total+=base_weight(i);
        }
        for(let i=0;i<n;i++){
            probs.push(base_weight(i)/total);
        }
        return probs;
    }

    // グループ内は基本の重みの比
    let groupTotal = { kichi: 0, naka: 0, kyou: 0 };
    for(let i=0;i<n;i++){
        groupTotal[FORTUNES[i].group]+=base_weight(i);
    }
    for(let i=0;i<n;i++){
        const g = FORTUNES[i].group;
        probs.push(share[g]*base_weight(i)/groupTotal[g]);
    }
    return probs;
}//finished

// 吉寄り・中立・凶寄りの合計（画面の表示用）
export function sumByGroup(probs)
{
    let sum = { kichi: 0, naka: 0, kyou: 0 };
    for(let i=0;i<probs.length;i++){
        sum[FORTUNES[i].group]+=probs[i];
    }
    return sum;
}

export function pickFortuneIdx(probs)
{
    let r = Math.random();
    for(let i=0;i<probs.length;i++){
        r=r-probs[i];
        if(r<0){
            return i;
        }
    }
    return probs.length-1;//誤差で残ったとき 最後
}

function pick_one(arr)
{
    return arr[Math.floor(Math.random()*arr.length)];
}

// 最初のパーツ＋みんなのパーツ 同じ言葉は1回だけ
export function mergeParts(extra)
{
    let merged = {};
    for(const kind of PART_KINDS){
        const k = kind.key;
        let seen = new Set();
        let list = [];
        const all = DEFAULT_PARTS[k].concat((extra && Array.isArray(extra[k])) ? extra[k] : []);
        for(const word of all){
            if(typeof word !== 'string'){
                continue;
            }
            const key = normalizeKey(word);
            if(key=='' || seen.has(key)){
                continue;
            }
            seen.add(key);
            list.push(word);
        }
        merged[k]=list;
    }
    return merged;
}

export function pickAdvice(parts)
{
    let advice = [];
    for(const kind of PART_KINDS){
        advice.push(pick_one(parts[kind.key]));
    }
    return advice;
}

export function buildSentence(advice)
{
    let s = '';
    for(let i=0;i<PART_KINDS.length;i++){
        s+=advice[i]+PART_KINDS[i].after;
    }
    return s;
}

// 重複チェック用 全角半角・空白をそろえる
export function normalizeKey(s)
{
    return String(s).normalize('NFKC').toLowerCase().replace(/\s+/g, '');
}

// 見た目の文字数
export function countChars(s)
{
    if(typeof Intl !== 'undefined' && Intl.Segmenter){
        let count=0;
        for(const seg of new Intl.Segmenter('ja', { granularity: 'grapheme' }).segment(s)){
            count++;
        }
        return count;
    }
    return Array.from(s).length;//古いブラウザ
}

// 改行・制御文字を消して前後の空白をとる
export function cleanPart(s)
{
    return String(s).replace(/[\u0000-\u001F\u007F]/g, '').trim();
}
