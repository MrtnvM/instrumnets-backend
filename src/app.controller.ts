import { Body, Controller, Get, Post, Req, UseGuards } from '@nestjs/common';
import { AppService } from './app.service';
import { OrderDto } from './models/order.dto';
import { FirebaseAuthGuard } from './core/providers/firebase-auth.guard';
import { FirebaseUserRequest } from './core/providers/firebase-user.request';

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

  @Get('orders')
  @UseGuards(new FirebaseAuthGuard())
  getOrders(@Req() request: FirebaseUserRequest) {
    return this.appService.getOrders(request.profileId);
  }
}
