export function showImportModeDialog(
  importCount: number,
  existingCount: number
): Promise<'merge' | 'overwrite' | null> {
  return new Promise((resolve) => {
    const dialog = document.createElement('div');
    dialog.style.cssText = `
      position: fixed;
      top: 0;
      left: 0;
      right: 0;
      bottom: 0;
      background: rgba(0, 0, 0, 0.5);
      display: flex;
      align-items: center;
      justify-content: center;
      z-index: 10000;
      font-family: system-ui, -apple-system, sans-serif;
    `;

    const isGlass = document.body.classList.contains('theme-dark');

    dialog.innerHTML = `
      <div style="
        background: ${isGlass ? 'rgba(15, 23, 42, 0.95)' : 'white'};
        backdrop-filter: ${isGlass ? 'blur(20px)' : 'none'};
        border: ${isGlass ? '1px solid rgba(99, 102, 241, 0.3)' : 'none'};
        border-radius: 16px;
        padding: 24px;
        max-width: 480px;
        width: 90%;
        box-shadow: ${isGlass ? '0 8px 32px rgba(0, 0, 0, 0.3), 0 0 20px rgba(99, 102, 241, 0.2)' : '0 20px 25px -5px rgba(0, 0, 0, 0.1)'};
      ">
        <h3 style="margin: 0 0 16px 0; font-size: 18px; font-weight: 600; color: ${isGlass ? '#ffffff' : '#1f2937'}; text-shadow: ${isGlass ? '0 2px 4px rgba(0, 0, 0, 0.6)' : 'none'};">
          选择导入模式
        </h3>
        <p style="margin: 0 0 20px 0; color: ${isGlass ? 'rgba(255, 255, 255, 0.9)' : '#6b7280'}; line-height: 1.5;">
          即将导入 <strong>${importCount}</strong> 条日记，当前已有 <strong>${existingCount}</strong> 条日记。
        </p>

        <div style="display: flex; flex-direction: column; gap: 12px; margin-bottom: 24px;">
          <label style="
            display: flex;
            align-items: flex-start;
            gap: 12px;
            padding: 16px;
            border: 2px solid ${isGlass ? 'rgba(99, 102, 241, 0.3)' : '#e5e7eb'};
            background: ${isGlass ? 'rgba(99, 102, 241, 0.1)' : 'white'};
            border-radius: 8px;
            cursor: pointer;
            transition: all 0.2s;
          " onmouseover="this.style.borderColor='${isGlass ? 'rgba(99, 102, 241, 0.6)' : '#3b82f6'}'; this.style.backgroundColor='${isGlass ? 'rgba(99, 102, 241, 0.2)' : '#f8fafc'}';"
             onmouseout="this.style.borderColor='${isGlass ? 'rgba(99, 102, 241, 0.3)' : '#e5e7eb'}'; this.style.backgroundColor='${isGlass ? 'rgba(99, 102, 241, 0.1)' : 'white'}';">
            <input type="radio" name="importMode" value="merge" checked style="margin-top: 2px;">
            <div>
              <div style="font-weight: 600; color: ${isGlass ? '#ffffff' : '#1f2937'}; margin-bottom: 4px; text-shadow: ${isGlass ? '0 1px 2px rgba(0, 0, 0, 0.5)' : 'none'};">
                🔗 合并导入（推荐）
              </div>
              <div style="color: ${isGlass ? 'rgba(255, 255, 255, 0.8)' : '#6b7280'}; font-size: 14px; line-height: 1.4;">
                保留现有的 ${existingCount} 条日记，添加新的 ${importCount} 条日记
              </div>
            </div>
          </label>

          <label style="
            display: flex;
            align-items: flex-start;
            gap: 12px;
            padding: 16px;
            border: 2px solid ${isGlass ? 'rgba(239, 68, 68, 0.3)' : '#e5e7eb'};
            background: ${isGlass ? 'rgba(239, 68, 68, 0.1)' : 'white'};
            border-radius: 8px;
            cursor: pointer;
            transition: all 0.2s;
          " onmouseover="this.style.borderColor='${isGlass ? 'rgba(239, 68, 68, 0.6)' : '#ef4444'}'; this.style.backgroundColor='${isGlass ? 'rgba(239, 68, 68, 0.2)' : '#fef2f2'}';"
             onmouseout="this.style.borderColor='${isGlass ? 'rgba(239, 68, 68, 0.3)' : '#e5e7eb'}'; this.style.backgroundColor='${isGlass ? 'rgba(239, 68, 68, 0.1)' : 'white'}';">
            <input type="radio" name="importMode" value="overwrite" style="margin-top: 2px;">
            <div>
              <div style="font-weight: 600; color: ${isGlass ? '#ffffff' : '#1f2937'}; margin-bottom: 4px; text-shadow: ${isGlass ? '0 1px 2px rgba(0, 0, 0, 0.5)' : 'none'};">
                🔄 覆盖导入
              </div>
              <div style="color: ${isGlass ? 'rgba(255, 255, 255, 0.8)' : '#6b7280'}; font-size: 14px; line-height: 1.4;">
                删除现有的所有日记，只保留导入的 ${importCount} 条日记
              </div>
            </div>
          </label>
        </div>

        <div style="display: flex; gap: 12px; justify-content: flex-end;">
          <button id="cancelBtn" style="
            padding: 8px 16px;
            border: 1px solid ${isGlass ? 'rgba(255, 255, 255, 0.3)' : '#d1d5db'};
            background: ${isGlass ? 'rgba(255, 255, 255, 0.1)' : 'white'};
            color: ${isGlass ? '#ffffff' : '#374151'};
            border-radius: 6px;
            cursor: pointer;
            font-size: 14px;
            text-shadow: ${isGlass ? '0 1px 2px rgba(0, 0, 0, 0.5)' : 'none'};
          ">取消</button>
          <button id="confirmBtn" style="
            padding: 8px 16px;
            border: none;
            background: ${isGlass ? 'linear-gradient(135deg, #6366f1 0%, #8b5cf6 100%)' : '#3b82f6'};
            color: white;
            border-radius: 6px;
            cursor: pointer;
            font-size: 14px;
            font-weight: 500;
            text-shadow: 0 1px 2px rgba(0, 0, 0, 0.5);
            box-shadow: ${isGlass ? '0 4px 16px rgba(0, 0, 0, 0.2), 0 0 15px rgba(99, 102, 241, 0.3)' : 'none'};
          ">确认导入</button>
        </div>
      </div>
    `;

    document.body.appendChild(dialog);

    const cancelBtn = dialog.querySelector('#cancelBtn');
    const confirmBtn = dialog.querySelector('#confirmBtn');

    const cleanup = () => {
      document.body.removeChild(dialog);
    };

    cancelBtn?.addEventListener('click', () => {
      cleanup();
      resolve(null);
    });

    confirmBtn?.addEventListener('click', () => {
      const selectedMode = dialog.querySelector('input[name="importMode"]:checked') as HTMLInputElement;
      cleanup();
      resolve(selectedMode?.value as 'merge' | 'overwrite');
    });

    dialog.addEventListener('click', (event) => {
      if (event.target === dialog) {
        cleanup();
        resolve(null);
      }
    });
  });
}
