import type {XYOwnedSlot} from './xychart-db.ts';

/** Effective native switches captured in the parse transaction. Point labels
 * have no visibility switch in the pinned renderer. */
export type XYVisibility=Readonly<{title:boolean;xTitle:boolean;yTitle:boolean;categories:boolean;legend:boolean}>;
export function captureXYVisibility(config:any):XYVisibility {
 return {title:Boolean(config.showTitle),xTitle:Boolean(config.xAxis.showTitle),yTitle:Boolean(config.yAxis.showTitle),categories:Boolean(config.xAxis.showLabel),legend:Boolean(config.showLegend)};
}
export function visibleXYSlots(candidates:readonly XYOwnedSlot[],visibility:XYVisibility):readonly XYOwnedSlot[] {
 if(!visibility||Object.keys(visibility).sort().join(',')!=='categories,legend,title,xTitle,yTitle'||Object.values(visibility).some(value=>typeof value!=='boolean'))throw new Error('XY visibility contract differs');
 return candidates.filter(slot=>{
  switch(slot.role){
   case 'title':return visibility.title;
   case 'xTitle':return visibility.xTitle;
   case 'yTitle':return visibility.yTitle;
   case 'category':return visibility.categories;
   case 'seriesTitle':return visibility.legend;
   case 'pointLabel':return true;
   default:throw new Error('XY candidate role is not drawable');
  }
 });
}
