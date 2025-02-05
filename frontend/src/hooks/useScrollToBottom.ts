import { useEffect, RefObject } from 'react';

export const useScrollToBottom = (
  messagesEndRef: RefObject<HTMLDivElement>,
  dependencies: any[]
) => {
  const flatDependencies = [messagesEndRef].concat(dependencies);

  useEffect(() => {
    const scrollToBottom = () => {
      if (messagesEndRef.current) {
        messagesEndRef.current.scrollIntoView({ behavior: 'smooth' });
      }
    };

    // 画像の読み込みが完了した後にスクロールを行う
    const images = document.querySelectorAll('img');
    let imagesLoaded = 0;
    const totalImages = images.length;

    if (totalImages === 0) {
      // 画像がない場合は即座にスクロール
      scrollToBottom();
      return;
    }

    images.forEach((img) => {
      if (img.complete) {
        imagesLoaded += 1;
        if (imagesLoaded === totalImages) {
          scrollToBottom();
        }
      } else {
        img.onload = () => {
          imagesLoaded += 1;
          if (imagesLoaded === totalImages) {
            scrollToBottom();
          }
        };
      }
    });
  }, flatDependencies);
}; 