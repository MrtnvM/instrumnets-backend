import { Body, Controller, Get, Post } from '@nestjs/common';
import { AppService } from './app.service';
import { OrderDto } from './models/order.dto';

@Controller()
export class AppController {
  constructor(private readonly appService: AppService) {}

  @Get('products')
  getProducts() {
    return this.appService.getCachedProducts();
  }

  @Post('order/create')
  createOrder(@Body() order: OrderDto) {
    return this.appService.createOrder(order);
  }
}
