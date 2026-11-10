<script setup lang="ts">
/**
 * @file 失物招领发布页（成员D）
 * @description 表单：类型/分类/标题/描述/地点/联系方式/昵称 + 提交
 *              图片上传：占位（后端上传接口待后续开发，当前 image_url 留空）
 * @author 第八组（成员D）
 * @date 2026-10-27
 */
import { reactive, ref } from 'vue';
import { useRouter } from 'vue-router';
import { showToast, showLoadingToast, closeToast } from 'vant';
import { createLostFound, type LostFoundCreateInput } from '../../api';

const router = useRouter();

const form = reactive<LostFoundCreateInput>({
  type: 'found',
  category: 'other',
  title: '',
  description: '',
  location: '',
  contact: '',
  publisher_name: '',
  image_url: '',
});

const categoryPickerColumns = [
  { text: '证件', value: 'card' },
  { text: '电子设备', value: 'electronics' },
  { text: '钱包', value: 'wallet' },
  { text: '行李', value: 'bag' },
  { text: '其他', value: 'other' },
];

const showCategoryPicker = ref(false);
const submitting = ref(false);

function onConfirmCategory({ selectedOptions }: { selectedOptions: Array<{ text: string; value: string }> }) {
  form.category = selectedOptions[0].value;
  showCategoryPicker.value = false;
}

const categoryLabel = () =>
  categoryPickerColumns.find((c) => c.value === form.category)?.text || '其他';

// 图片选择（仅前端占位，后端上传接口待后续开发）
const imagePreview = ref<string>('');
function onChooseImage(evt: Event) {
  const file = (evt.target as HTMLInputElement).files?.[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = (e) => {
    imagePreview.value = (e.target as FileReader).result as string;
  };
  reader.readAsDataURL(file);
  showToast('图片上传接口待后端实现，暂仅预览');
}

function validate(): string | null {
  if (!form.title.trim()) return '请填写标题';
  if (!form.description?.trim()) return '请填写描述';
  if (!form.location?.trim()) return '请填写地点';
  if (!form.contact?.trim()) return '请填写联系方式';
  return null;
}

async function onSubmit() {
  const err = validate();
  if (err) {
    showToast(err);
    return;
  }
  submitting.value = true;
  showLoadingToast({ message: '提交中...', forbidClick: true });
  try {
    await createLostFound({ ...form, title: form.title.trim(), description: form.description?.trim() });
    closeToast();
    showToast('发布成功');
    setTimeout(() => {
      router.back();
    }, 800);
  } catch (e: unknown) {
    closeToast();
    const msg = e instanceof Error ? e.message : '发布失败';
    showToast(msg);
  } finally {
    submitting.value = false;
  }
}
</script>

<template>
  <div class="publish-page">
    <van-form @submit="onSubmit">
      <!-- 类型 -->
      <van-cell-group inset>
        <van-field label="类型" required>
          <template #input>
            <van-radio-group v-model="form.type" direction="horizontal">
              <van-radio name="lost">遗失启事</van-radio>
              <van-radio name="found">招领启事</van-radio>
            </van-radio-group>
          </template>
        </van-field>

        <van-field
          label="分类"
          :value="categoryLabel()"
          readonly
          required
          is-link
          @click="showCategoryPicker = true"
        />

        <van-field
          v-model="form.title"
          label="标题"
          placeholder="例如：在苏堤捡到一张校园卡"
          required
          maxlength="64"
          show-word-limit
        />

        <van-field
          v-model="form.description"
          label="详细描述"
          type="textarea"
          placeholder="物品/遗失物的特征、详细情况"
          rows="3"
          autosize
          required
          maxlength="500"
          show-word-limit
        />

        <van-field
          v-model="form.location"
          label="地点"
          placeholder="在什么位置丢失/拾取"
          required
        />

        <van-field
          v-model="form.contact"
          label="联系方式"
          placeholder="手机号 / 微信 / 邮箱"
          required
        />

        <van-field v-model="form.publisher_name" label="昵称" placeholder="您的昵称（可选）" />

        <!-- 图片（占位） -->
        <van-cell title="图片（可选）">
          <template #value>
            <label class="image-upload" for="file-input">
              <van-image v-if="imagePreview" width="80" height="80" :src="imagePreview" fit="cover" />
              <van-icon v-else name="plus" class="add-icon" />
              <input
                id="file-input"
                type="file"
                accept="image/*"
                hidden
                @change="onChooseImage"
              />
            </label>
          </template>
        </van-cell>
      </van-cell-group>

      <!-- 提交 -->
      <div class="submit-wrap">
        <van-button round block type="primary" native-type="submit" :loading="submitting">
          立即发布
        </van-button>
      </div>
    </van-form>

    <!-- 分类 picker -->
    <van-popup v-model:show="showCategoryPicker" position="bottom">
      <van-picker
        columns="categoryPickerColumns"
        @confirm="onConfirmCategory"
        @cancel="showCategoryPicker = false"
      />
    </van-popup>
  </div>
</template>

<style scoped>
.publish-page {
  padding: 12px;
  padding-bottom: 80px;
}

.image-upload {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 80px;
  height: 80px;
  border: 1px dashed #dcdee0;
  border-radius: 8px;
  cursor: pointer;
  background: #fafafa;
}
.image-upload .add-icon {
  font-size: 28px;
  color: #969799;
}

.submit-wrap {
  margin-top: 24px;
  padding: 0 16px;
}
</style>
