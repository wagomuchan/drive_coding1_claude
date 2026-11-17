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
    { key: 'itsu', label: 'いつ', after: 'に、', placeholder: '怪獣がうんこをした後' },
    { key: 'doko', label: 'どこ', after: 'で、', placeholder: '冷蔵庫の裏' },
    { key: 'nani', label: '何をする', after: 'と、', placeholder: '全力で謝る' },
    { key: 'dounaru', label: 'どうなる', after: '。', placeholder: '靴下が増える' },
];

// 最初から入れておくパーツ 各30個
export const DEFAULT_PARTS = {
    itsu: [
        '怪獣がうんこをした後',
        '校長先生が三回まわった後',
        '冷蔵庫が初めてしゃべった日',
        'ハトが会議を始めたとき',
        'カッパが皿を割った直後',
        '月がちょっと照れた夜',
        'おじいちゃんが宇宙に行く前',
        '大根がスキップし始めた頃',
        '信号機があくびをした瞬間',
        '宇宙人が道に迷ったとき',
        '忍者がくしゃみをした直後',
        'カレーが冷めきった頃',
        '恐竜が二度寝した朝',
        '靴下が片方家出した日',
        'ゾウが逆立ちに成功した後',
        '金魚が引っ越しを決めた夜',
        '犬がため息をついた瞬間',
        '雲がソフトクリームになった日',
        '消しゴムが反抗期に入った頃',
        'ペンギンが空を見上げた後',
        '時計が十三時を打ったとき',
        'タコが墨を出し惜しみした日',
        '雪だるまが汗をかき始めた頃',
        'お地蔵さんがウインクした後',
        'トイレットペーパーが尽きた瞬間',
        '隣の猫が筋トレを始めた日',
        '豆腐が角をなくした夜',
        'ロボットが恋に落ちた直後',
        '魔王が寝ぐせを直した後',
        'カラスが「おはよう」と言った朝',
    ],
    doko: [
        '冷蔵庫の裏',
        '近所のサウナの天井',
        'ちくわの穴の中',
        '校長室のど真ん中',
        '誰もいない遊園地',
        '月の裏側の公民館',
        'おばあちゃんの夢の中',
        'ブロッコリーの森',
        '押し入れの奥の奥',
        '回転寿司のレーンの上',
        '富士山のてっぺん',
        '巨大なプリンの上',
        'エレベーターの中',
        '駅のホームの端っこ',
        '宇宙ステーションのトイレ',
        'カバの口の中',
        'すべり台の下',
        '図書館の秘密の部屋',
        '洗濯機の中',
        '深夜のコンビニ',
        '雲の上の駐車場',
        '地底人のリビング',
        'ラーメンのスープの底',
        '誰かの靴の中',
        'ふかふかの布団の中',
        '竜宮城の受付',
        '段ボール箱の中',
        '金魚鉢のすみっこ',
        '職員室の前',
        '夢と現実のあいだ',
    ],
    nani: [
        '全力で謝る',
        '逆立ちで歌う',
        '大根を抱きしめる',
        'ひたすら拍手する',
        '小声で自己紹介する',
        '白目でスキップする',
        '納豆を千回まぜる',
        'お尻で名前を書く',
        'カニ歩きで一周する',
        'ポーズを決めて黙る',
        '空気を読まずに踊る',
        '三回まわってワンと言う',
        '枕に悩みを相談する',
        '全力で深呼吸する',
        'ちくわを笛にして吹く',
        '鼻歌で校歌を歌う',
        '靴を左右逆にはく',
        'ハトに道を聞く',
        '冷蔵庫に話しかける',
        '両手でピースする',
        '真顔でモノマネする',
        '豆腐をじっと見つめる',
        '声を出さずに笑う',
        'カッパに弟子入りする',
        'スプーンを曲げようとする',
        '消しゴムに名前をつける',
        'うんこの絵を描く',
        '寝たふりをする',
        'バナナで電話をかける',
        '「うどん」と叫ぶ',
    ],
    dounaru: [
        '靴下が増える',
        '鼻毛が一本だけ光る',
        '明日が二回来る',
        '冷蔵庫に好かれる',
        '体重が一瞬だけ減る',
        '知らないおじさんと仲良くなる',
        '運気が横に伸びる',
        '耳から拍手が聞こえる',
        '全部うまくいく気がする',
        'ハトに尊敬される',
        '財布のレシートが増える',
        '前世がカニだったとわかる',
        'くしゃみが止まらなくなる',
        '豆腐の気持ちがわかる',
        '宝くじが当たる夢を見る',
        '足の小指を守れる',
        '次の信号が全部青になる',
        '寝ぐせが芸術になる',
        'カッパから年賀状が届く',
        '背が一ミリ伸びる',
        '牛乳が少しだけ甘くなる',
        '運勢がどうでもよくなる',
        'お腹が鳴りやまなくなる',
        'ポケットからどんぐりが出る',
        '宇宙から招待状が届く',
        '魔王に一目置かれる',
        '金魚に励まされる',
        'うんこが金色に輝く',
        '何も起きないが満足する',
        '人生で一番いい顔になる',
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
