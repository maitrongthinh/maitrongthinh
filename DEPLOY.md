# Deploy lên GitHub Pages

Repo này đã có sẵn workflow `.github/workflows/deploy.yml`. Không cần viết thêm gì —
bật Pages rồi push.

## 1. Repo đích và cái bẫy của nó

```
https://github.com/maitrongthinh/maitrongthinh
```

Repo trùng tên user, nên GitHub coi nó là **profile repo**: `README.md` ở gốc hiện
lên trang profile. Nhưng **nó không phải user site**. User site bắt buộc phải tên
`maitrongthinh.github.io`. Vì vậy Pages serve repo này như một **project page**,
tức là dưới đường dẫn con:

```
https://maitrongthinh.github.io/maitrongthinh/
```

Hệ quả duy nhất cần quan tâm: mọi URL phải có tiền tố `/maitrongthinh`. Đã cấu hình
sẵn ở hai chỗ:

- `.github/workflows/deploy.yml` → `BASE_PATH: '/maitrongthinh'`
- `next.config.mjs` đọc biến đó cho cả `basePath` và `assetPrefix`

`basePath` chỉ xử lý những URL do Next tự phát ra (`_next/...`, `next/link`). Đường
dẫn viết tay tới `public/` thì không — nên chúng đi qua `asset()` trong
`src/lib/asset.ts`. Thêm ảnh, video, nhạc mới thì bọc bằng `asset()`, đừng viết
`'/images/x.webp'` trần.

Muốn site chạy ở gốc domain: tạo repo `maitrongthinh.github.io`, đổi `BASE_PATH`
thành `''`. Không cần sửa gì khác.

## 2. Khởi tạo git và push

Thư mục này chưa phải git repo. Từ `e:\portfolio`:

```bash
git init -b main
git add .
git commit -m "feat: portfolio site"
git remote add origin https://github.com/maitrongthinh/maitrongthinh.git
git push -u origin main
```

`.gitignore` đã loại `node_modules`, `.next`, `out` — không commit build output,
Actions tự build.

Nếu repo trên GitHub đã có commit (ví dụ README tạo lúc khởi tạo repo), push sẽ bị
từ chối. Kéo về trước rồi push lại:

```bash
git pull --rebase origin main
git push -u origin main
```

## 3. Bật GitHub Pages

Trên GitHub: **Settings** → **Pages** → **Build and deployment** → **Source** đổi
thành **GitHub Actions**.

Bắt buộc. Nếu để mặc định "Deploy from a branch", Pages sẽ chạy Jekyll trên source
và bỏ qua workflow.

## 4. Chờ workflow

Tab **Actions** → run "Deploy to GitHub Pages". Hai job: `build` rồi `deploy`.
Xong thì site ở `https://maitrongthinh.github.io/maitrongthinh/`.

Lần đầu mất 2–4 phút (cài dependencies). Lần sau nhanh hơn vì `cache: npm`.

## Những gì workflow tự làm

- `npm ci` rồi `npm run build` → static export ra `out/`
- `postbuild` chạy `scripts/flatten-flight.mjs out` — đổi tên các file payload có
  ký tự Windows/URL không hợp lệ; thiếu bước này thì route MDX bị hỏng khi điều
  hướng bằng client-side
- `GITHUB_TOKEN` được truyền vào build để phần GitHub stats không bị rate limit
  ẩn danh (60 request/giờ)
- Cron `17 4 * * *`: build lại mỗi ngày. Số liệu GitHub được bake vào HTML lúc
  build, không fetch ở browser, nên không rebuild thì số sẽ cũ dần
- `.nojekyll` nằm trong `public/` nên tự copy sang `out/`. Không có nó, GitHub bỏ
  qua toàn bộ thư mục `_next/`

## Kiểm tra trước khi push

`npm run serve:out` serve `out/` ở gốc, còn Pages serve nó dưới `/maitrongthinh`.
Build có `BASE_PATH` mà serve ở gốc thì trắng trang — đó là bình thường, không phải
lỗi. Muốn thử đúng hình dạng thật thì tạo một thư mục cha rồi trỏ vào:

```bash
# build đúng như Actions build (Git Bash cần MSYS2_ENV_CONV_EXCL, nếu không
# `/maitrongthinh` bị dịch thành đường dẫn Windows)
MSYS2_ENV_CONV_EXCL=BASE_PATH BASE_PATH=/maitrongthinh npm run build

mkdir -p .tmp-verify/subpath
cmd //c "mklink /J .tmp-verify\subpath\maitrongthinh out"
npx serve .tmp-verify/subpath -l 4174
# http://localhost:4174/maitrongthinh/
```

Đây là chính xác những byte mà Pages sẽ serve. Chạy được ở đây thì chạy được trên
Pages, trừ đúng một khác biệt: Pages có HTTPS và HTTP/2, localhost thì không.

Build thường (`npm run build`, không set `BASE_PATH`) vẫn chạy ở gốc `4173` như cũ —
dùng cho dev, đừng dùng để kết luận về Pages.

## Domain riêng (nếu cần sau này)

Thêm file `public/CNAME` chứa đúng một dòng là domain, ví dụ `maitrongthinh.dev`.
Nó sẽ được copy vào `out/`. Rồi trỏ DNS: `A` record về 4 IP của GitHub Pages
(`185.199.108.153`, `.109.153`, `.110.153`, `.111.153`), hoặc `CNAME` về
`maitrongthinh.github.io`.

Domain riêng thì site về gốc domain — nhớ đổi `BASE_PATH` thành `''`, không thì mọi
asset lệch thêm một cấp `/maitrongthinh`.

## Lỗi thường gặp

| Triệu chứng | Nguyên nhân |
| --- | --- |
| Trang trắng, console 404 hàng loạt `/_next/...` | `BASE_PATH` không khớp tên repo — repo `maitrongthinh` thì phải là `/maitrongthinh` |
| Ảnh hero / video / nhạc 404 nhưng phần còn lại chạy | Đường dẫn `public/` viết trần, không bọc `asset()` |
| CSS mất, chỉ còn HTML thô | `.nojekyll` không có trong `out/` |
| Workflow không chạy | Pages Source vẫn là "Deploy from a branch" |
| Số GitHub stats bị 0 | Rate limit — kiểm tra `GITHUB_TOKEN` có trong step `Build static export` |
| Route `/notes/...` 404 khi vào trực tiếp | `postbuild` không chạy; kiểm tra log có dòng `flatten-flight: ... mirrored` |


