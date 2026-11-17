// 東京都（都庁あたり）の今日の天気 Open-Meteo キーいらない

const WEATHER_URL = 'https://api.open-meteo.com/v1/forecast'
    + '?latitude=35.6895&longitude=139.6917'
    + '&daily=weather_code&timezone=Asia%2FTokyo&forecast_days=1';
const WEATHER_TIMEOUT_MS = 8000;

// WMOの天気コード 全部
// hare=晴れ kumori=曇り ame=雨・雪
const WMO = {
    0: ['快晴', 'hare'],
    1: ['晴れ', 'hare'],
    2: ['晴れ時々曇り', 'hare'],
    3: ['曇り', 'kumori'],
    45: ['霧', 'kumori'],
    48: ['霧（霧氷つき）', 'kumori'],
    51: ['弱い霧雨', 'ame'],
    53: ['霧雨', 'ame'],
    55: ['強い霧雨', 'ame'],
    56: ['弱い着氷性の霧雨', 'ame'],
    57: ['強い着氷性の霧雨', 'ame'],
    61: ['小雨', 'ame'],
    63: ['雨', 'ame'],
    65: ['大雨', 'ame'],
    66: ['弱い着氷性の雨', 'ame'],
    67: ['強い着氷性の雨', 'ame'],
    71: ['小雪', 'ame'],
    73: ['雪', 'ame'],
    75: ['大雪', 'ame'],
    77: ['霧雪', 'ame'],
    80: ['弱いにわか雨', 'ame'],
    81: ['にわか雨', 'ame'],
    82: ['激しいにわか雨', 'ame'],
    85: ['弱いにわか雪', 'ame'],
    86: ['強いにわか雪', 'ame'],
    95: ['雷雨', 'ame'],
    96: ['ひょうまじりの雷雨', 'ame'],
    99: ['激しいひょうまじりの雷雨', 'ame'],
};

export function codeToWeather(code)
{
    if(!Number.isInteger(code) || code<0){
        return null;
    }
    if(code in WMO){
        return { code: code, name: WMO[code][0], group: WMO[code][1] };
    }
    return { code: code, name: '雨か雪', group: 'ame' };//知らないコード→それ以外すべて
}

// 取れなかったら null
export async function fetchTokyoWeather()
{
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), WEATHER_TIMEOUT_MS);
    try {
        const res = await fetch(WEATHER_URL, { signal: controller.signal });
        if(!res.ok){
            return null;
        }
        const data = await res.json();
        const code = data && data.daily && Array.isArray(data.daily.weather_code) ? data.daily.weather_code[0] : null;
        return codeToWeather(code);
    } catch (err) {
        //console.log('天気だめ', err);
        return null;
    } finally {
        clearTimeout(timer);
    }
}

// 神社っぽいお知らせ 3段階＋わからない
export function weatherMessage(weather)
{
    if(weather == null){
        return '本日の東京の空模様は、神のみぞ知るところ。すべての運勢が等しく出ます。';
    }
    if(weather.group=='hare'){
        return '本日の東京は' + weather.name + '。天のご機嫌うるわしく、吉が出やすくなっております。';
    }
    if(weather.group=='kumori'){
        return '本日の東京は' + weather.name + '。吉と凶が相半ばする一日にございます。';
    }
    return '本日の東京は' + weather.name + '。凶が出やすくなっております。足元にお気をつけて。';
}
