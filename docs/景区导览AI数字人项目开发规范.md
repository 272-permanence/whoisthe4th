# 景区导览服务 AI 数字人项目开发规范

> 版本号：1.0.0  
> 制定团队：第八组技术团队  
> 更新日期：2026-10-15  
> 技术栈：Vue 3 + TypeScript（前端）、Node.js + Express + TypeScript（后端）

---

## 前言

《景区导览服务 AI 数字人项目开发规范》是本项目技术团队的集体智慧结晶与经验总结，旨在统一前后端代码风格、提升协作效率、保障交付质量。本规范借鉴《阿里巴巴 Java 开发手册》的规约体系，结合本项目 TypeScript 全栈技术栈（Vue 3 + Node.js + Express）进行适配与扩展。

本规范的愿景是**码出高效，码出质量**。现代软件架构需要协同开发完成，高效协作即降低协同成本、提升沟通效率。对软件来说，适当的规范和标准绝不是消灭代码的创造性与优雅性，而是限制过度个性化，以一种普遍认可的统一方式一起做事，提升协作效率。

本规范以开发者为中心视角，划分为**编程规约、异常日志、单元测试、安全规约、数据库规约、工程结构、代码规范监测组件配置**七个维度，再根据内容特征细分成若干二级子目录。根据约束力强弱及故障敏感性，规约依次分为：

- 【强制】：必须遵守，违反将导致代码无法通过 Review 或 CI 检查
- 【推荐】：强烈建议遵守，特殊情况可豁免但需说明
- 【参考】：最佳实践，鼓励遵守

---

## 目录

- [一、编程规约](#一编程规约)
  - [(一) 命名风格](#一-命名风格)
  - [(二) 常量定义](#二-常量定义)
  - [(三) 代码格式](#三-代码格式)
  - [(四) TypeScript 规约](#四-typescript-规约)
  - [(五) 集合处理](#五-集合处理)
  - [(六) 异步处理](#六-异步处理)
  - [(七) 控制语句](#七-控制语句)
  - [(八) 注释规约](#八-注释规约)
- [二、异常日志](#二异常日志)
  - [(一) 异常处理](#一-异常处理-1)
  - [(二) 日志规约](#二-日志规约)
- [三、单元测试](#三单元测试)
- [四、安全规约](#四安全规约)
- [五、数据库规约](#五数据库规约)
  - [(一) 建表规约](#一-建表规约)
  - [(二) 索引规约](#二-索引规约)
  - [(三) SQL 语句](#三-sql-语句)
- [六、工程结构](#六工程结构)
  - [(一) 应用分层](#一-应用分层)
  - [(二) 依赖管理](#二-依赖管理)
  - [(三) 服务器与部署](#三-服务器与部署)
- [七、代码规范监测组件配置](#七代码规范监测组件配置)
  - [(一) 前端 ESLint 配置](#一-前端-eslint-配置)
  - [(二) 后端代码规范配置](#二-后端代码规范配置)
  - [(三) Prettier 统一格式化配置](#三-prettier-统一格式化配置)
  - [(四) 注释模板配置](#四-注释模板配置)

---

# 一、编程规约

## (一) 命名风格

1. 【强制】代码中的命名均不能以下划线或美元符号开始，也不能以下划线或美元符号结束。  
   反例：`_name` / `__name` / `$name` / `name_` / `name$` / `name__`

2. 【强制】代码中的命名严禁使用拼音与英文混合的方式，更不允许直接使用中文的方式。  
   说明：正确的英文拼写和语法可以让阅读者易于理解，避免歧义。即使纯拼音命名方式也要避免采用。  
   正例：`scenicSpot` / `guideBot` / `hangzhou` 等国际通用名称可视同英文。  
   反例：`DaZhePromotion`（打折）/ `getPingfenByName()`（评分）/ `某变量 = 3`

3. 【强制】类名、接口名、类型名使用 UpperCamelCase 风格，以下情形例外：DTO / VO / DO / PO 等缩写。  
   正例：`ScenicSpotService` / `UserDTO` / `ChatMessage` / `TcpUdpDeal`  
   反例：`scenicSpotService` / `userDto` / `XMLService`

4. 【强制】方法名、参数名、成员变量、局部变量统一使用 lowerCamelCase 风格，必须遵从驼峰形式。  
   正例：`localValue` / `getHttpMessage()` / `inputUserId` / `scenicSpotId`

5. 【强制】常量命名全部大写，单词间用下划线隔开，力求语义表达完整清楚，不要嫌名字长。  
   正例：`MAX_STOCK_COUNT` / `DEFAULT_PAGE_SIZE` / `AI_CHAT_TIMEOUT_MS`  
   反例：`MAX_COUNT` / `defaultPageSize`

6. 【强制】抽象类命名使用 `Abstract` 或 `Base` 开头；异常类命名使用 `Exception` 或 `Error` 结尾；测试类命名以它要测试的类名开始，以 `.spec` 或 `.test` 结尾。  
   正例：`AbstractScenicService` / `BaseController` / `BusinessException` / `ChatService.spec.ts`

7. 【强制】布尔类型变量命名使用 `is` / `has` / `can` / `should` 等前缀，避免与方法名混淆。  
   正例：`isDeleted` / `hasPermission` / `canEdit`  
   反例：`deleted` / `permission`

8. 【强制】文件命名：组件文件使用 UpperCamelCase（如 `ChatPanel.vue`），工具/服务/路由文件使用 lowerCamelCase 或 kebab-case。  
   正例：`ChatPanel.vue` / `chatService.ts` / `user-routes.ts`

9. 【强制】杜绝完全不规范的缩写，避免望文不知义。  
   反例：`AbstractClass` 缩写成 `AbsClass`；`condition` 缩写成 `condi`，此类随意缩写严重降低代码可阅读性。

10. 【推荐】为了达到代码自解释的目标，任何自定义编程元素在命名时，使用尽量完整的单词组合来表达其意。  
    正例：从远程仓库拉取代码的方法命名为 `pullCodeFromRemoteRepository`。  
    反例：`const a = 3;` 的随意命名方式。

11. 【推荐】如果模块、接口、类、方法使用了设计模式，在命名时体现出具体模式。  
    说明：将设计模式体现在名字中，有利于阅读者快速理解架构设计理念。  
    正例：`OrderFactory` / `LoginProxy` / `ResourceObserver` / `ChatStrategy`

12. 【推荐】Vue 组件命名使用 PascalCase，且为多单词组合，避免与 HTML 原生元素冲突。  
    正例：`ScenicSpotCard` / `ChatMessageList` / `AiGuideAvatar`

13. 【参考】枚举类型名建议带上 `Enum` 后缀，枚举成员名称全大写，单词间用下划线隔开。  
    正例：`ChatStatusEnum.SUCCESS` / `ChatStatusEnum.UNKNOWN_REASON`

## (二) 常量定义

1. 【强制】不允许任何魔法值（即未经预先定义的常量）直接出现在代码中。  
   反例：
   ```ts
   const key = 'Id#taobao_' + tradeId;
   cache.put(key, value);
   ```

2. 【强制】数字常量必须使用明确的字面量表示，避免使用易混淆的写法。  
   说明：大数字使用 `_` 分隔提高可读性，如 `1_000_000`。

3. 【推荐】不要使用一个常量类/常量文件维护所有常量，按常量功能进行归类，分开维护。  
   说明：大而全的常量类，非得使用查找功能才能定位到修改的常量，不利于理解和维护。  
   正例：缓存相关常量放在 `cacheConstants.ts`；系统配置相关常量放在 `systemConstants.ts`；AI 对话相关常量放在 `aiChatConstants.ts`。

4. 【推荐】常量按复用层次管理：
   1. 跨应用共享常量：放置在公共包的 `constants` 目录下
   2. 应用内共享常量：放置在 `src/constants` 目录下
   3. 模块内共享常量：放置在对应模块的 `constants.ts` 中
   4. 类内/文件内常量：直接在文件内部使用 `const` 定义

5. 【推荐】如果变量值仅在一个固定范围内变化，用枚举类型（TypeScript `enum` 或联合类型）来定义。  
   正例：
   ```ts
   enum ChatRoleEnum {
     USER = 'user',
     ASSISTANT = 'assistant',
     SYSTEM = 'system'
   }
   ```

6. 【推荐】配置项（端口、URL、超时时间等）禁止硬编码，必须从环境变量或配置文件读取。  
   正例：参考 [config.ts](file:///c:/Users/28238/Desktop/whoisthe4th/backend/src/config.ts) 的实现，从 `process.env` 读取。

## (三) 代码格式

1. 【强制】大括号的使用约定。如果是大括号内为空，则简洁地写成 `{}` 即可，不需要换行；如果是非空代码块则：
   1. 左大括号前不换行
   2. 左大括号后换行
   3. 右大括号前换行
   4. 右大括号后还有 `else` 等代码则不换行；表示终止的右大括号后必须换行

2. 【强制】左小括号和字符之间不出现空格；同样，右小括号和字符之间也不出现空格。  
   反例：`if ( a == b )`

3. 【强制】`if` / `for` / `while` / `switch` / `do` 等保留字与括号之间都必须加空格。

4. 【强制】任何二目、三目运算符的左右两边都需要加一个空格。  
   说明：运算符包括赋值运算符 `=`、逻辑运算符 `&&`、加减乘除符号等。

5. 【强制】采用 2 个空格缩进，禁止使用 tab 字符。  
   说明：这是 Vue / Vite / TypeScript 生态的主流约定。若使用 tab 缩进，必须设置 1 个 tab 为 2 个空格。

6. 【强制】注释的双斜线与注释内容之间有且仅有一个空格。  
   正例：
   ```ts
   // 这是示例注释，请注意在双斜线之后有一个空格
   const ygb = 'hello';
   ```

7. 【强制】单行字符数限制不超过 120 个，超出需要换行，换行时遵循如下原则：
   1. 第二行相对第一行缩进 4 个空格，从第三行开始不再继续缩进
   2. 运算符与下文一起换行
   3. 方法调用的点符号与下文一起换行
   4. 方法调用时多个参数需要换行时，在逗号后进行
   5. 在括号前不要换行

8. 【强制】方法参数在定义和传入时，多个参数逗号后边必须加空格。  
   正例：`method('a', 'b', 'c');`

9. 【强制】IDE 的 text file encoding 设置为 UTF-8；文件换行符使用 LF 格式（统一使用 Unix 风格），避免 CRLF 与 LF 混用。  
   说明：在 `.gitattributes` 中配置 `* text=auto eol=lf`。

10. 【推荐】没有必要增加若干空格来使某一行的字符与上一行对应位置的字符对齐。

11. 【推荐】不同逻辑、不同语义、不同业务的代码之间插入一个空行分隔开来以提升可读性。  
    说明：没有必要插入多个空行进行隔开。

12. 【推荐】语句末尾必须加分号，保持代码风格统一。

## (四) TypeScript 规约

1. 【强制】所有变量、函数参数、函数返回值必须显式声明类型，禁止使用隐式 `any`。  
   说明：在 `tsconfig.json` 中开启 `strict: true` 与 `noImplicitAny: true`。  
   反例：
   ```ts
   function getData(name) {  // 缺少类型声明
     return name;
   }
   ```

2. 【强制】禁止使用 `any` 类型，如确需使用，必须用 `// eslint-disable-next-line @typescript-eslint/no-explicit-any` 显式声明并注释原因。  
   说明：优先使用 `unknown` 替代 `any`，然后做类型收窄。

3. 【强制】接口（`interface`）命名使用 `I` 前缀或直接使用业务名，二选一全项目统一。  
   正例：`IUserService` 或 `UserService`（本项目统一不加 `I` 前缀，使用业务名）

4. 【强制】类型与接口分离：描述数据结构用 `interface`，描述联合类型、交叉类型、映射类型用 `type`。  
   正例：
   ```ts
   interface ChatMessage {
     id: string;
     role: ChatRoleEnum;
     content: string;
   }
   type ChatRole = 'user' | 'assistant' | 'system';
   ```

5. 【强制】类成员必须显式声明访问修饰符（`public` / `protected` / `private`），默认使用 `private`。  
   说明：严控访问范围，过于宽泛的访问范围不利于模块解耦。

6. 【强制】不要使用过时的 API 或类库方法。  
   说明：如 `var` 已被 `let` / `const` 取代；`==` 应替换为 `===`。

7. 【强制】对象比较使用引用比较时需注意，值比较使用深比较工具（如 `lodash.isEqual`）。  
   说明：不要用 `==` 比较对象，会产生隐式类型转换。

8. 【强制】函数参数不超过 3 个，超过时使用对象传参。  
   正例：
   ```ts
   function createChat({ userId, message, scene }: CreateChatParams) { ... }
   ```

9. 【推荐】优先使用 `const` 声明变量，只有在需要重新赋值时才使用 `let`，禁止使用 `var`。

10. 【推荐】使用可选链 `?.` 和空值合并 `??` 替代冗长的空值判断。  
    正例：
    ```ts
    const name = user?.profile?.name ?? '未知';
    ```
    反例：
    ```ts
    const name = user && user.profile && user.profile.name ? user.profile.name : '未知';
    ```

11. 【推荐】使用 `readonly` 修饰不应被修改的属性，使用 `as const` 声明只读字面量。

12. 【推荐】泛型命名使用有意义的单词或单字母（`T` / `K` / `V` / `E`），避免晦涩。

13. 【推荐】枚举值优先使用字符串枚举，便于调试与日志输出。

14. 【参考】对于可空类型，显式声明 `T | null` 或 `T | undefined`，不要依赖隐式 undefined。

## (五) 集合处理

1. 【强制】判断集合是否为空使用 `length === 0` 或 `size === 0`，不要使用 `!arr`（空数组为 truthy）。  
   反例：
   ```ts
   if (!list) { ... }  // 空数组 [] 为 true，判断永远为 false
   ```

2. 【强制】使用 `Array.from` 或展开运算符 `...` 复制数组，不要直接赋值（引用传递）。  
   正例：`const copy = [...original];`

3. 【强制】遍历数组优先使用 `forEach` / `map` / `filter` / `reduce` 等函数式方法，避免修改原数组。

4. 【强制】在循环中不要对数组进行 `push` / `splice` 等修改操作，可能导致索引错乱。  
   说明：如需删除元素，使用 `filter` 生成新数组。

5. 【强制】使用 `Map` / `Set` 处理键值对和去重场景，不要用普通对象模拟。  
   正例：
   ```ts
   const uniqueIds = new Set(ids);
   const userMap = new Map(users.map(u => [u.id, u]));
   ```

6. 【推荐】数组方法链式调用时注意性能，避免多次遍历。  
   说明：`filter().map()` 会遍历两次，大数据量时考虑单次 `reduce`。

7. 【推荐】初始化集合时指定容量或大小提示，避免频繁扩容。

8. 【推荐】使用 `Object.keys` / `Object.values` / `Object.entries` 遍历对象，不要用 `for...in`（会遍历原型链）。

## (六) 异步处理

1. 【强制】所有异步操作必须使用 `async/await`，禁止直接使用回调嵌套（回调地狱）。  
   反例：
   ```ts
   getUser(id, (user) => {
     getOrders(user.id, (orders) => {
       getDetails(orders[0].id, (details) => { ... });
     });
   });
   ```

2. 【强制】`await` 必须在 `try/catch` 中，或使用 `.catch()` 处理异常，禁止未捕获的 Promise rejection。  
   说明：未捕获的 Promise 拒绝会导致进程崩溃或 UnhandledRejection 警告。

3. 【强制】不要在 `forEach` 中使用 `await`（不会等待异步完成），应使用 `for...of` 或 `Promise.all`。  
   正例：
   ```ts
   for (const item of items) {
     await process(item);
   }
   // 或并行
   await Promise.all(items.map(item => process(item)));
   ```

4. 【强制】并发请求使用 `Promise.all` / `Promise.allSettled`，不要串行 await 多个独立请求。  
   正例：
   ```ts
   const [user, spots, comments] = await Promise.all([
     getUser(userId),
     getScenicSpots(),
     getComments()
   ]);
   ```

5. 【推荐】长耗时操作必须设置超时时间，避免请求挂起。  
   正例：
   ```ts
   const response = await Promise.race([
     fetch(url),
     new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), 5000))
   ]);
   ```

6. 【推荐】SSE（Server-Sent Events）流式接口必须正确设置响应头，并处理客户端断开连接的清理逻辑。  
   说明：参考 [chat.ts](file:///c:/Users/28238/Desktop/whoisthe4th/backend/src/routes/chat.ts) 中的实现，监听 `req.on('close')` 清理定时器。

7. 【推荐】错误重试使用指数退避策略，避免无限重试压垮服务。

## (七) 控制语句

1. 【强制】在一个 `switch` 块内，每个 `case` 要么通过 `break` / `return` 等来终止，要么注释说明程序将继续执行到哪一个 `case`；必须包含 `default` 语句并放在最后。  
   说明：在 `tsconfig.json` 中开启 `noFallthroughCasesInSwitch`。

2. 【强制】在 `if` / `else` / `for` / `while` / `do` 语句中必须使用大括号。即使只有一行代码，避免单行编码。  
   反例：`if (condition) statement;`

3. 【强制】在高并发场景中，避免使用"等于"判断作为中断或退出的条件，使用大于或小于的区间判断。

4. 【推荐】表达异常分支时，少用 `if-else` 嵌套，使用卫语句（guard clause）提前返回。  
   正例：
   ```ts
   function process(input) {
     if (!input) return null;
     if (input.invalid) throw new Error('invalid');
     // 正常逻辑
   }
   ```

5. 【推荐】`if-else` 嵌套不超过 3 层，超过时使用策略模式、状态模式或函数拆分。

6. 【推荐】除常用方法（如 `getXxx` / `isXxx`）外，不要在条件判断中执行复杂语句，将复杂逻辑判断结果赋值给有意义的布尔变量。  
   正例：
   ```ts
   const canEdit = user.role === 'admin' && spot.status === 'published';
   if (canEdit) { ... }
   ```

7. 【推荐】避免采用取反逻辑运算符。  
   正例：`if (count < 100)` 表达数量小于 100。  
   反例：`if (!(count >= 100))`。

8. 【推荐】循环体中的语句要考量性能，以下操作尽量移至循环体外处理：定义对象、变量、获取数据库连接、不必要的 `try-catch`。

## (八) 注释规约

1. 【强制】类、类属性、类方法的注释必须使用 JSDoc 规范，使用 `/** 内容 */` 格式，不得使用 `// xxx` 方式。  
   说明：JSDoc 注释在 IDE 中可悬浮提示，生成文档可正确输出。

2. 【强制】所有的公共方法（导出的函数、类方法）必须用 JSDoc 注释，说明功能、参数、返回值、异常。  
   正例：
   ```ts
   /**
    * 发送 AI 对话消息并返回流式响应
    * @param message 用户输入的消息内容
    * @param userId 用户唯一标识
    * @returns 流式响应的 Readable Stream
    * @throws {BusinessException} 当消息为空或用户未登录时抛出
    */
   export function sendChatMessage(message: string, userId: string): Readable { ... }
   ```

3. 【强制】所有的文件头部必须添加创建者、创建日期、功能描述注释。  
   正例：
   ```ts
   /**
    * @file 景区导览 AI 对话路由模块
    * @author 第八组
    * @date 2026-10-15
    * @description 处理 AI 对话的 SSE 流式接口
    */
   ```

4. 【强制】方法内部单行注释，在被注释语句上方另起一行，使用 `//` 注释。方法内部多行注释使用 `/* */`。

5. 【强制】所有枚举类型字段必须要有注释，说明每个数据项的用途。

6. 【强制】Vue 组件中，`props` 和 `emits` 必须添加注释说明用途。

7. 【推荐】与其"半吊子"英文来注释，不如用中文注释把问题说清楚。专有名词与关键字保持英文原文即可。

8. 【推荐】代码修改的同时，注释也要进行相应的修改，尤其是参数、返回值、异常、核心逻辑等的修改。

9. 【参考】谨慎注释掉代码。在上方详细说明，而不是简单地注释掉。如果无用，则删除（Git 已保存历史）。

10. 【参考】特殊注释标记需注明标记人与标记时间，并及时处理：
    - `TODO`：待办事项，格式 `// TODO(标记人, 标记时间): 待办内容`
    - `FIXME`：已知错误，格式 `// FIXME(标记人, 标记时间): 问题描述`

---

# 二、异常日志

## (一) 异常处理

1. 【强制】可以通过预检查方式规避的运行时异常，不应该通过 `try/catch` 来处理。  
   说明：如空值判断应使用可选链，而非捕获 `TypeError`。  
   正例：`if (obj != null) { ... }`  
   反例：`try { obj.method() } catch (e) { ... }`

2. 【强制】异常不要用来做流程控制或条件控制。  
   说明：异常设计初衷是处理意外情况，性能远低于条件判断。

3. 【强制】`catch` 时分清稳定代码和非稳定代码，对非稳定代码的 `catch` 尽可能区分异常类型，再做对应处理。  
   说明：不要对大段代码进行笼统的 `try/catch`，不利于定位问题。

4. 【强制】捕获异常是为了处理它，不要捕获后什么都不做。如果不想处理，应将异常抛给调用者。最外层业务必须处理异常，转化为用户可理解的内容。

5. 【强制】`finally` 块中必须关闭资源（流、连接、定时器等），关闭操作本身也要 `try/catch`。  
   说明：Node.js 中优先使用 `try-with-resources`（`using` 关键字）或 `dispose` 模式。

6. 【强制】不要在 `finally` 块中使用 `return`。  
   说明：`finally` 中的 `return` 会覆盖 `try` 块中的返回值。

7. 【强制】不要使用空的 `catch` 块吞掉异常，至少要打印错误日志。  
   反例：
   ```ts
   try {
     await riskyOperation();
   } catch (e) {
     // 空 catch，吞掉异常
   }
   ```

8. 【推荐】自定义业务异常类继承 `Error`，携带错误码和错误信息，便于前端统一处理。  
   正例：
   ```ts
   class BusinessException extends Error {
     constructor(public code: number, message: string) {
       super(message);
       this.name = 'BusinessException';
     }
   }
   ```

9. 【推荐】对外 HTTP 接口统一返回错误码，不直接抛异常给前端。  
   正例：
   ```ts
   res.status(400).json({ code: 10001, message: '消息内容不能为空' });
   ```

10. 【推荐】避免重复代码（DRY 原则），抽取共性方法或公共类。

## (二) 日志规约

1. 【强制】应用中不可直接使用 `console.log` 输出业务日志，应使用统一的日志框架（如 `pino`、`winston`）。  
   说明：`console.log` 无级别控制、无结构化输出，不利于线上排查。  
   反例：`console.log('用户登录:', userId);`

2. 【强制】日志文件推荐至少保存 15 天，错误日志单独存放。

3. 【强制】日志命名格式：`appName_logType_logName.log`。  
   说明：`logType` 可选 `error` / `info` / `access` / `audit` 等，通过文件名即可知日志用途。

4. 【强制】日志输出必须使用占位符方式，避免字符串拼接造成不必要的性能损耗。  
   正例：
   ```ts
   logger.info('用户 {} 发送消息: {}', userId, message);
   ```
   反例：
   ```ts
   logger.info('用户 ' + userId + ' 发送消息: ' + message);
   ```

5. 【强制】异常日志必须包含两类信息：案发现场信息（参数、上下文）和异常堆栈信息。  
   正例：
   ```ts
   logger.error('AI 对话失败, userId=%s, message=%s', userId, userInput, error);
   ```

6. 【推荐】生产环境禁止输出 `debug` 级别日志；有选择地输出 `info` 日志；`warn` 记录业务异常行为；`error` 只记录系统错误和重要异常。

7. 【推荐】敏感信息（密码、token、手机号、身份证）禁止直接打印到日志，必须脱敏处理。  
   正例：手机号显示为 `158****9119`。

8. 【推荐】请求日志应包含请求 ID（traceId），便于全链路追踪。

9. 【参考】大量输出无效日志不利于性能提升和错误定位，记录日志时请思考：这条日志有人看吗？能帮我排查问题吗？

---

# 三、单元测试

1. 【强制】好的单元测试必须遵守 AIR 原则：
   - **A**utomatic（自动化）：全自动执行，非交互式
   - **I**ndependent（独立性）：用例之间不互相调用、不依赖执行顺序
   - **R**epeatable（可重复）：不受外界环境影响

2. 【强制】单元测试必须使用断言库（如 `vitest` / `jest`）验证结果，不准使用 `console.log` 人肉验证。

3. 【强制】保持单元测试独立性，用例之间不能互相调用，也不能依赖执行先后次序。

4. 【强制】单元测试粒度至多是类级别，一般是方法级别，便于精确定位问题。

5. 【强制】核心业务、核心模块的增量代码必须确保单元测试通过。

6. 【强制】单元测试代码放在 `__tests__` 目录或与源码同级的 `*.spec.ts` / `*.test.ts` 文件中，不允许写在业务代码目录下。

7. 【推荐】单元测试基本目标：语句覆盖率达到 70%；核心模块的语句覆盖率和分支覆盖率达到 100%。

8. 【推荐】编写单元测试遵守 BCDE 原则：
   - **B**order：边界值测试（循环边界、特殊取值、数据顺序）
   - **C**orrect：正确输入，得到预期结果
   - **D**esign：与设计文档相结合编写
   - **E**rror：强制错误信息输入（非法数据、异常流程），得到预期结果

9. 【推荐】对外部依赖（数据库、网络、第三方 API）使用 Mock，保证测试不受外界环境影响。

10. 【推荐】数据库相关测试使用事务回滚机制，不给数据库造成脏数据。

11. 【参考】不可测的代码建议重构，避免为了测试而写不规范的测试代码。

12. 【参考】不要对单元测试存在误解：那不是测试同学的事，单元测试是开发质量保障的重要手段。

---

# 四、安全规约

1. 【强制】隶属于用户个人的页面或功能必须进行权限控制校验，防止越权访问（水平权限、垂直权限）。

2. 【强制】用户敏感数据禁止直接展示，必须脱敏处理。  
   说明：手机号 `158****9119`、身份证 `110***********1234`。

3. 【强制】用户输入的 SQL 参数严格使用参数绑定（PreparedStatement），禁止字符串拼接 SQL，防止 SQL 注入。

4. 【强制】用户请求传入的任何参数必须做有效性验证。  
   说明：忽略参数校验可能导致：page size 过大内存溢出、恶意 order by 慢查询、任意重定向、SQL 注入、反序列化注入、ReDoS 正则拒绝服务。

5. 【强制】禁止向前端输出未经安全过滤或未正确转义的用户数据，防止 XSS 攻击。  
   说明：Vue 默认对插值 `{{ }}` 进行转义，但 `v-html` 必须确保内容安全。

6. 【强制】表单、AJAX 提交必须执行 CSRF 安全防护（如使用 SameSite Cookie、CSRF Token）。

7. 【强制】密码、API Key、Token 等敏感信息禁止硬编码在代码中，必须通过环境变量注入，且 `.env` 文件必须加入 `.gitignore`。

8. 【强制】CORS 配置必须明确允许的源，禁止使用 `origin: '*'` 配合 `credentials: true`。  
   说明：参考 [app.ts](file:///c:/Users/28238/Desktop/whoisthe4th/backend/src/app.ts) 中的 CORS 配置，从 `config.frontendUrl` 读取允许的源。

9. 【强制】文件上传必须校验文件类型、大小、扩展名，防止上传恶意文件。

10. 【推荐】发贴、评论、发送即时消息等用户生成内容的场景必须实现防刷、违禁词过滤等风控策略。

11. 【推荐】接口访问频率限制（Rate Limiting），防止暴力破解和恶意刷接口。

12. 【推荐】HTTPS 传输敏感数据，禁止 HTTP 明文传输密码和 Token。

---

# 五、数据库规约

> 本项目目前尚未引入数据库，以下规约为后续接入数据库（如 MySQL / PostgreSQL）时的预设规范。

## (一) 建表规约

1. 【强制】表达是与否概念的字段，使用 `is_xxx` 方式命名，数据类型为 `tinyint`（1 表示是，0 表示否）。  
   正例：`is_deleted`（1 表示删除，0 表示未删除）

2. 【强制】表名、字段名必须使用小写字母或数字，禁止出现数字开头，禁止两个下划线中间只出现数字。  
   说明：MySQL 在 Windows 下不区分大小写，Linux 下区分大小写，统一小写避免问题。  
   正例：`scenic_spot`、`chat_message`、`user_profile`  
   反例：`ScenicSpot`、`chatMessage`、`level_3_name`

3. 【强制】表名不使用复数名词。  
   说明：表名表示实体内容，不表示数量。

4. 【强制】禁用保留字，如 `desc`、`range`、`match`、`delayed` 等。

5. 【强制】主键索引名为 `pk_字段名`；唯一索引名为 `uk_字段名`；普通索引名为 `idx_字段名`。

6. 【强制】小数类型使用 `decimal`，禁止使用 `float` 和 `double`。  
   说明：float 和 double 存在精度损失。

7. 【强制】`varchar` 长度不超过 5000，超过则使用 `text` 类型并独立建表。

8. 【强制】表必备三字段：`id`、`gmt_create`、`gmt_modified`。  
   说明：`id` 为 BIGINT 主键自增；`gmt_create` / `gmt_modified` 为 datetime 类型。

9. 【推荐】表名加上"业务名称_表的作用"前缀。  
   正例：`scenic_spot` / `chat_history` / `user_favorite`

10. 【推荐】字段允许适当冗余以提高查询性能，但冗余字段应为非频繁修改、非超长字段。

## (二) 索引规约

1. 【强制】业务上具有唯一特性的字段，即使是多字段组合，也必须建成唯一索引。

2. 【强制】超过三个表禁止 join。需要 join 的字段，数据类型必须绝对一致，且被关联字段需要有索引。

3. 【强制】在 `varchar` 字段上建立索引时，必须指定索引长度。

4. 【强制】页面搜索严禁左模糊或全模糊（`'%xxx'` / `'%xxx%'`），需要模糊搜索走搜索引擎。

5. 【推荐】利用覆盖索引查询，避免回表。

6. 【推荐】建组合索引时，区分度最高的列放在最左边。

7. 【推荐】防止因字段类型不同造成隐式转换，导致索引失效。

## (三) SQL 语句

1. 【强制】不要使用 `count(列名)` 或 `count(常量)` 替代 `count(*)`，`count(*)` 是 SQL92 标准语法。

2. 【强制】使用 `ISNULL()` 或 `IS NULL` 判断 NULL 值，不要用 `= NULL`。

3. 【强制】分页查询时，若 `count` 为 0 应直接返回，避免执行分页语句。

4. 【强制】禁止使用外键与级联，外键概念在应用层解决。  
   说明：外键与级联不适合分布式、高并发集群。

5. 【强制】禁止使用存储过程，难以调试和扩展。

6. 【强制】数据订正（删除、修改）时，先 `select` 确认无误再执行更新。

7. 【推荐】`in` 操作能避免则避免，实在避免不了，控制在 1000 个元素之内。

8. 【推荐】所有字符存储使用 UTF-8 编码，如需存储表情使用 `utf8mb4`。

---

# 六、工程结构

## (一) 应用分层

1. 【推荐】后端应用分层架构：
   ```
   backend/src/
   ├── app.ts              # 应用入口，中间件注册、路由挂载
   ├── config.ts           # 配置管理（环境变量）
   ├── routes/             # 路由层：参数校验、请求转发
   │   └── chat.ts
   ├── controllers/        # 控制器层：业务编排
   ├── services/           # 服务层：核心业务逻辑
   ├── repositories/       # 数据访问层：与数据库交互
   ├── models/             # 数据模型（DTO / VO / Entity）
   ├── middlewares/        # 中间件（鉴权、日志、错误处理）
   ├── utils/              # 工具类
   └── constants/          # 常量定义
   ```

2. 【推荐】前端应用分层架构：
   ```
   frontend/src/
   ├── main.ts             # 应用入口
   ├── App.vue             # 根组件
   ├── api/                # 接口请求封装
   ├── assets/             # 静态资源
   ├── components/         # 通用组件
   ├── views/              # 页面组件
   ├── stores/             # 状态管理（Pinia）
   ├── router/             # 路由配置
   ├── composables/        # 组合式函数
   ├── utils/              # 工具函数
   ├── types/              # TypeScript 类型定义
   └── styles/             # 全局样式
   ```

3. 【推荐】分层依赖规则：上层依赖下层，禁止反向依赖和跨层依赖。
   - 路由层 → 控制器层 → 服务层 → 数据访问层
   - 服务层之间可以互相调用，但避免循环依赖

4. 【参考】领域模型命名规约：
   - `Entity`：数据库实体，与表结构一一对应
   - `DTO`（Data Transfer Object）：数据传输对象，服务间传输
   - `VO`（View Object）：展示层对象，前端展示用
   - `Query`：查询条件对象，超过 2 个参数的查询封装

## (二) 依赖管理

1. 【强制】`package.json` 中版本号使用语义化版本（Semantic Versioning）：`主版本号.次版本号.修订号`。

2. 【强制】生产环境依赖（`dependencies`）与开发依赖（`devDependencies`）严格区分。

3. 【强制】禁止依赖未发布的 SNAPSHOT 或 beta 版本（明确评估的除外）。

4. 【强制】定期更新依赖，修复安全漏洞，使用 `npm audit` 检查。

5. 【推荐】锁定依赖版本，使用 `package-lock.json` 保证构建一致性。

6. 【推荐】新增依赖前评估包的维护状态、下载量、许可协议，避免引入无人维护的包。

## (三) 服务器与部署

1. 【推荐】高并发服务器建议调小 TCP 协议的 `time_wait` 超时时间。  
   说明：默认 240 秒，高并发下可能无法建立新连接，建议调至 30 秒。

2. 【推荐】调大服务器最大文件句柄数（File Descriptor）。  
   说明：默认 1024，并发连接大时容易出现 "too many open files"。

3. 【推荐】Node.js 服务设置内存上限和 GC 参数，生产环境使用 `--max-old-space-size` 合理配置。

4. 【推荐】使用 PM2 或 Docker 部署 Node.js 服务，配置进程守护和自动重启。

5. 【推荐】健康检查接口（`/health`）用于负载均衡探活。

---

# 七、代码规范监测组件配置

## (一) 前端 ESLint 配置

### 1. 安装依赖

```bash
npm install eslint --save-dev
npm install eslint-plugin-vue --save-dev
npm install @typescript-eslint/parser @typescript-eslint/eslint-plugin --save-dev
```

### 2. 配置 package.json scripts

```json
{
  "scripts": {
    "dev": "vite",
    "build": "vue-tsc -b && vite build",
    "lint": "eslint src --ext .vue,.ts,.tsx",
    "lint:fix": "eslint src --ext .vue,.ts,.tsx --fix"
  }
}
```

说明：
- `lint`：检查 src 目录下所有 `.vue`、`.ts`、`.tsx` 文件
- `lint:fix`：自动修复基础格式错误

### 3. 创建 .eslintrc.cjs

```js
module.exports = {
  root: true,
  env: {
    browser: true,
    es2022: true,
    node: true
  },
  extends: [
    'eslint:recommended',
    'plugin:vue/vue3-recommended',
    'plugin:@typescript-eslint/recommended'
  ],
  parser: 'vue-eslint-parser',
  parserOptions: {
    parser: '@typescript-eslint/parser',
    ecmaVersion: 'latest',
    sourceType: 'module'
  },
  rules: {
    // 命名规范
    '@typescript-eslint/naming-convention': [
      'error',
      { selector: 'class', format: ['PascalCase'] },
      { selector: 'interface', format: ['PascalCase'] },
      { selector: 'typeAlias', format: ['PascalCase'] },
      { selector: 'enum', format: ['PascalCase'], suffix: ['Enum'] },
      { selector: 'function', format: ['camelCase'] },
      { selector: 'variable', format: ['camelCase', 'UPPER_CASE'] }
    ],
    // 禁止 any
    '@typescript-eslint/no-explicit-any': 'error',
    // 必须使用 ===
    'eqeqeq': ['error', 'always'],
    // 禁止 var
    'no-var': 'error',
    // 优先 const
    'prefer-const': 'error',
    // 语句必须分号
    'semi': ['error', 'always'],
    // 缩进 2 空格
    'indent': ['error', 2],
    // 引号使用单引号
    'quotes': ['error', 'single'],
    // Vue 组件命名
    'vue/multi-word-component-names': 'error',
    'vue/component-name-in-template-casing': ['error', 'PascalCase']
  }
};
```

### 4. 常用 ESLint 规则说明

| 规则名 | 级别 | 说明 |
|--------|------|------|
| `no-unused-vars` | error | 禁止声明未使用的变量 |
| `no-console` | warn | 禁止使用 console（生产环境） |
| `no-debugger` | error | 禁止使用 debugger |
| `no-dupe-keys` | error | 对象字面量键不重复 |
| `no-fallthrough` | error | switch 禁止穿透 |
| `no-constant-condition` | error | 禁止常量条件表达式 |
| `curly` | error | 必须使用大括号 |
| `no-multiple-empty-lines` | warn | 空行最多 2 行 |
| `no-trailing-spaces` | warn | 行尾禁止空格 |
| `comma-dangle` | error | 对象末尾禁止逗号 |
| `camelcase` | error | 强制驼峰命名 |
| `max-len` | warn | 单行不超过 120 字符 |

## (二) 后端代码规范配置

### 1. 安装依赖

```bash
npm install eslint --save-dev
npm install @typescript-eslint/parser @typescript-eslint/eslint-plugin --save-dev
```

### 2. 配置 package.json scripts

```json
{
  "scripts": {
    "dev": "tsx watch src/app.ts",
    "build": "tsc",
    "start": "node dist/app.js",
    "lint": "eslint src --ext .ts",
    "lint:fix": "eslint src --ext .ts --fix"
  }
}
```

### 3. 创建 .eslintrc.cjs（后端）

```js
module.exports = {
  root: true,
  env: {
    node: true,
    es2022: true
  },
  extends: [
    'eslint:recommended',
    'plugin:@typescript-eslint/recommended'
  ],
  parser: '@typescript-eslint/parser',
  parserOptions: {
    ecmaVersion: 'latest',
    sourceType: 'module'
  },
  rules: {
    '@typescript-eslint/no-explicit-any': 'error',
    '@typescript-eslint/explicit-function-return-type': 'warn',
    '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
    'eqeqeq': ['error', 'always'],
    'no-var': 'error',
    'prefer-const': 'error',
    'semi': ['error', 'always'],
    'indent': ['error', 2],
    'quotes': ['error', 'single'],
    'no-console': ['warn', { allow: ['warn', 'error'] }]
  }
};
```

## (三) Prettier 统一格式化配置

### 1. 安装依赖

```bash
npm install prettier --save-dev
npm install eslint-config-prettier eslint-plugin-prettier --save-dev
```

### 2. 创建 .prettierrc

```json
{
  "semi": true,
  "singleQuote": true,
  "tabWidth": 2,
  "useTabs": false,
  "printWidth": 120,
  "trailingComma": "none",
  "bracketSpacing": true,
  "arrowParens": "always",
  "endOfLine": "lf",
  "vueIndentScriptAndStyle": false
}
```

### 3. 创建 .prettierignore

```
node_modules
dist
*.min.js
*.min.css
package-lock.json
```

### 4. 在 ESLint 中集成 Prettier

在 `.eslintrc.cjs` 的 `extends` 中添加 `'plugin:prettier/recommended'`（放在最后），确保 Prettier 规则不与 ESLint 冲突。

## (四) 注释模板配置

### 1. VS Code 配置文件头注释模板

在 VS Code 中安装 `koroFileHeader` 插件，配置 `.vscode/settings.json`：

```json
{
  "fileheader.customMade": {
    "Description": "",
    "Author": "第八组",
    "Date": "",
    "LastEditTime": "",
    "FilePath": ""
  },
  "fileheader.cursorMode": {
    "Description": "",
    "Param": "",
    "Return": "",
    "Author": "第八组",
    "Date": ""
  }
}
```

### 2. TypeScript 方法注释模板

在 VS Code 中输入 `/**` 后按回车，自动生成 JSDoc 模板：

```ts
/**
 * [description]
 * @param {[type]} paramName [description]
 * @returns {[type]} [description]
 */
```

### 3. Vue 组件注释模板

```vue
<script setup lang="ts">
/**
 * @description 组件功能描述
 * @property {string} title - 标题
 * @emits update - 触发更新事件
 */
</script>
```

---

## 附 1：版本历史

| 版本号 | 更新日期 | 备注 |
|--------|----------|------|
| 1.0.0 | 2026-10-15 | 初版发布，涵盖编程规约、异常日志、单元测试、安全规约、数据库规约、工程结构、代码规范监测组件配置七大维度 |

## 附 2：专有名词

| 缩写 | 全称 | 说明 |
|------|------|------|
| DTO | Data Transfer Object | 数据传输对象 |
| VO | View Object | 展示层对象 |
| SSE | Server-Sent Events | 服务器推送事件，用于 AI 流式响应 |
| NPE | Null Pointer Exception | 空指针异常（TypeScript 中表现为 TypeError） |
| CSRF | Cross-Site Request Forgery | 跨站请求伪造 |
| XSS | Cross-Site Scripting | 跨站脚本攻击 |
| CORS | Cross-Origin Resource Sharing | 跨域资源共享 |
| CI | Continuous Integration | 持续集成 |
| DRY | Don't Repeat Yourself | 不要重复自己 |
| AIR | Automatic Independent Repeatable | 单元测试三原则 |
