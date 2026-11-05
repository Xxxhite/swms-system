# 地区字典来源

版本：swms-gd-zj-20261105-01，核验日期：2026-11-05。

参考本机mysales.areas的代码、名称、父级、层级组织方式。原表未修改。

基础数据来自 https://github.com/modood/Administrative-divisions-of-China 的dist/pca-code.json，保留广东及浙江的省／市／县级节点。上游为WTFPL v2，许可原文见 https://raw.githubusercontent.com/modood/Administrative-divisions-of-China/master/LICENSE 。下载文件SHA256为83b7536f853ad16beb4d37b92890a3fd7bb9d33d4f37e7c8885fb948749a9bc4。该包是固定参考版本，不宣称为全国实时区划数据。

深圳9行政区名称／代码与深圳民政局公开汇总校核：https://mzj.sz.gov.cn/szmz/pc/bmxx/mzfwzy/xzqh/bmxx/content/mpost_10275240.html 。现行概况：https://mzj.sz.gov.cn/szmz/pc/bmxx/cyfwzy/content/mpost_2949169.html 。

东莞／中山无县级行政区，其9位街道节点不导入三级县区字典。大鹏新区及深汕特别合作区使用BIZ_内部键，kind=SERVICE，作为深圳业务服务区域；不是新增行政区划代码。地理与业务归属分别解释，参见 https://www.sz.gov.cn/cn/zjsz/gl/content/post_12318787.html 。

字典运行仅依赖项目地区表，后续扩充须校核来源、父子、代码与层级，再经显式导入。
