/* 股票代码库（名称 -> 代码 模糊搜索用）
 * 格式：{ code: "000538.SZ", name: "云南白药" }
 * code 后缀：.SH 上交所 / .SZ 深交所 / .HK 港交所
 * 覆盖范围：主流 A 股蓝筹 + 行业龙头 + 常见港股（方案 A）。
 * 想新增股票：在此数组追加一项即可（也可告诉我帮你加）。
 */
window.STOCK_DB = [
  /* ===== 用户已知 / 持仓 / 心选 ===== */
  { code: "000538.SZ", name: "云南白药" },
  { code: "601318.SH", name: "中国平安" },
  { code: "600519.SH", name: "贵州茅台" },
  { code: "00700.HK", name: "腾讯控股" },
  { code: "03690.HK", name: "美团" },
  { code: "09988.HK", name: "阿里巴巴" },
  { code: "00939.HK", name: "建设银行" },
  { code: "01398.HK", name: "工商银行" },
  { code: "03988.HK", name: "中国银行" },
  { code: "00883.HK", name: "中国海洋石油" },
  { code: "00005.HK", name: "汇丰控股" },

  /* ===== 银行 ===== */
  { code: "600036.SH", name: "招商银行" },
  { code: "601166.SH", name: "兴业银行" },
  { code: "600000.SH", name: "浦发银行" },
  { code: "600016.SH", name: "民生银行" },
  { code: "601328.SH", name: "交通银行" },
  { code: "601998.SH", name: "中信银行" },
  { code: "600015.SH", name: "华夏银行" },
  { code: "601818.SH", name: "光大银行" },
  { code: "601288.SH", name: "农业银行" },
  { code: "601988.SH", name: "中国银行" },
  { code: "002142.SZ", name: "宁波银行" },
  { code: "000001.SZ", name: "平安银行" },
  { code: "600928.SH", name: "西安银行" },
  { code: "601077.SH", name: "渝农商行" },
  { code: "601229.SH", name: "上海银行" },
  { code: "600919.SH", name: "江苏银行" },

  /* ===== 保险 ===== */
  { code: "601628.SH", name: "中国人寿" },
  { code: "601601.SH", name: "中国太保" },
  { code: "601319.SH", name: "中国人保" },
  { code: "600901.SH", name: "江苏国泰" },

  /* ===== 证券 ===== */
  { code: "600030.SH", name: "中信证券" },
  { code: "600837.SH", name: "海通证券" },
  { code: "000776.SZ", name: "广发证券" },
  { code: "601688.SH", name: "华泰证券" },
  { code: "600999.SH", name: "招商证券" },
  { code: "000166.SZ", name: "申万宏源" },
  { code: "002736.SZ", name: "国信证券" },

  /* ===== 白酒 / 食品饮料 ===== */
  { code: "000858.SZ", name: "五粮液" },
  { code: "002304.SZ", name: "洋河股份" },
  { code: "600809.SH", name: "山西汾酒" },
  { code: "000568.SZ", name: "泸州老窖" },
  { code: "603369.SH", name: "今世缘" },
  { code: "600887.SH", name: "伊利股份" },
  { code: "000895.SZ", name: "双汇发展" },
  { code: "603288.SH", name: "海天味业" },
  { code: "600132.SH", name: "重庆啤酒" },
  { code: "000729.SZ", name: "燕京啤酒" },
  { code: "600600.SH", name: "青岛啤酒" },

  /* ===== 医药 ===== */
  { code: "600276.SH", name: "恒瑞医药" },
  { code: "300760.SZ", name: "迈瑞医疗" },
  { code: "002594.SZ", name: "比亚迪" },
  { code: "600196.SH", name: "复星医药" },
  { code: "000963.SZ", name: "华东医药" },
  { code: "600085.SH", name: "同仁堂" },
  { code: "000423.SZ", name: "东阿阿胶" },
  { code: "002821.SZ", name: "凯莱英" },
  { code: "300347.SZ", name: "泰格医药" },
  { code: "600436.SH", name: "片仔癀" },
  { code: "002041.SZ", name: "登海种业" },

  /* ===== 家电 / 消费 ===== */
  { code: "000333.SZ", name: "美的集团" },
  { code: "000651.SZ", name: "格力电器" },
  { code: "600690.SH", name: "海尔智家" },
  { code: "002032.SZ", name: "苏泊尔" },
  { code: "603195.SH", name: "公牛集团" },
  { code: "600315.SH", name: "上海家化" },
  { code: "603605.SH", name: "珀莱雅" },

  /* ===== 汽车 / 新能源 ===== */
  { code: "601127.SH", name: "赛力斯" },
  { code: "002594.SZ", name: "比亚迪" },
  { code: "600104.SH", name: "上汽集团" },
  { code: "601238.SH", name: "广汽集团" },
  { code: "601633.SH", name: "长城汽车" },
  { code: "600066.SH", name: "宇通客车" },
  { code: "300750.SZ", name: "宁德时代" },
  { code: "002466.SZ", name: "天齐锂业" },
  { code: "002460.SZ", name: "赣锋锂业" },
  { code: "300014.SZ", name: "亿纬锂能" },
  { code: "688599.SH", name: "天合光能" },

  /* ===== 石油 / 化工 / 电力 ===== */
  { code: "601857.SH", name: "中国石油" },
  { code: "600028.SH", name: "中国石化" },
  { code: "600938.SH", name: "中国海油" },
  { code: "601088.SH", name: "中国神华" },
  { code: "600900.SH", name: "长江电力" },
  { code: "600025.SH", name: "华能水电" },
  { code: "600795.SH", name: "国电电力" },
  { code: "601985.SH", name: "中国核电" },
  { code: "003816.SZ", name: "中国广核" },
  { code: "600346.SH", name: "恒力石化" },
  { code: "600426.SH", name: "华鲁恒升" },
  { code: "002648.SZ", name: "卫星化学" },

  /* ===== 煤炭 / 钢铁 / 有色 ===== */
  { code: "600188.SH", name: "兖矿能源" },
  { code: "601225.SH", name: "陕西煤业" },
  { code: "000983.SZ", name: "山西焦煤" },
  { code: "600348.SH", name: "华阳股份" },
  { code: "601699.SH", name: "潞安环能" },
  { code: "600585.SH", name: "海螺水泥" },
  { code: "000792.SZ", name: "盐湖股份" },
  { code: "600362.SH", name: "江西铜业" },
  { code: "601600.SH", name: "中国铝业" },
  { code: "600547.SH", name: "山东黄金" },
  { code: "601899.SH", name: "紫金矿业" },

  /* ===== 地产 / 建筑 ===== */
  { code: "600048.SH", name: "保利发展" },
  { code: "001979.SZ", name: "招商蛇口" },
  { code: "600340.SH", name: "华夏幸福" },
  { code: "601668.SH", name: "中国建筑" },
  { code: "601390.SH", name: "中国中铁" },
  { code: "601186.SH", name: "中国铁建" },
  { code: "601800.SH", name: "中国交建" },
  { code: "600170.SH", name: "上海建工" },

  /* ===== 通信 / 科技 ===== */
  { code: "600941.SH", name: "中国移动" },
  { code: "601728.SH", name: "中国电信" },
  { code: "600050.SH", name: "中国联通" },
  { code: "000063.SZ", name: "中兴通讯" },
  { code: "002415.SZ", name: "海康威视" },
  { code: "002230.SZ", name: "科大讯飞" },
  { code: "688981.SH", name: "中芯国际" },
  { code: "688041.SH", name: "海光信息" },
  { code: "002049.SZ", name: "紫光国微" },
  { code: "603501.SH", name: "韦尔股份" },
  { code: "688256.SH", name: "寒武纪" },
  { code: "300033.SZ", name: "同花顺" },
  { code: "300059.SZ", name: "东方财富" },

  /* ===== 交运 / 物流 / 公用 ===== */
  { code: "601006.SH", name: "大秦铁路" },
  { code: "600009.SH", name: "上海机场" },
  { code: "600115.SH", name: "中国东航" },
  { code: "601021.SH", name: "春秋航空" },
  { code: "002352.SZ", name: "顺丰控股" },
  { code: "600233.SH", name: "圆通速递" },
  { code: "601098.SH", name: "中南传媒" },
  { code: "601928.SH", name: "凤凰传媒" },

  /* ===== 农业 / 其他消费 ===== */
  { code: "600298.SH", name: "安琪酵母" },
  { code: "002311.SZ", name: "海大集团" },
  { code: "300498.SZ", name: "温氏股份" },
  { code: "002714.SZ", name: "牧原股份" },
  { code: "600873.SH", name: "梅花生物" },
  { code: "603899.SH", name: "晨光文具" },
  { code: "600612.SH", name: "老凤祥" },
  { code: "002867.SZ", name: "周大生" }
];
